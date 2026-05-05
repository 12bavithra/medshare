import express from 'express';
import Medicine from '../models/Medicine.js';
import MedicineRequest from '../models/MedicineRequest.js';
import User from '../models/User.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { sendEmail, emailTemplates } from '../utils/email.js';

const router = express.Router();

// Create a new request (RECIPIENT)
router.post('/:medicineId', authRequired, requireRole(['RECIPIENT']), async (req, res) => {
  try {
    const { medicineId } = req.params;
    const medicine = await Medicine.findById(medicineId).populate('donor', 'name email');
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
    if (medicine.donor._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'Cannot request your own medicine' });
    }

    const existing = await MedicineRequest.findOne({ medicineId, recipientId: req.user.id, status: { $in: ['PENDING', 'APPROVED'] } });
    if (existing) return res.status(400).json({ message: 'You already have a request for this medicine' });

    const request = await MedicineRequest.create({ medicineId, recipientId: req.user.id });

    // Respond immediately after DB success
    res.status(201).json({ message: 'Request submitted', request });

    // Fire-and-forget emails to donor, recipient, and admin
    setImmediate(() => {
      (async () => {
        try {
          const recipient = await User.findById(req.user.id);

          if (medicine.donor && medicine.donor.email) {
            const donorHtmlMessage = emailTemplates.donorRequestNotification(
              medicine.donor.name,
              recipient?.name,
              medicine.name,
              medicine.quantity
            );
            try {
              const donorEmailResult = await sendEmail(medicine.donor.email, 'Someone Requested Your Donation - MedShare', donorHtmlMessage);
              if (donorEmailResult.success) {
                console.log(`✅ Donor notification email sent to ${medicine.donor.email}`);
              } else {
                console.log(`⚠️ Donor notification email failed for ${medicine.donor.email}: ${donorEmailResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Request email send error (donor):', e.message);
            }
          }

          if (recipient && recipient.email) {
            const recipientHtmlMessage = emailTemplates.requestNotification(
              recipient.name,
              medicine.donor.name,
              medicine.name,
              medicine.quantity
            );
            try {
              const recipientEmailResult = await sendEmail(recipient.email, 'Request Submitted - MedShare', recipientHtmlMessage);
              if (recipientEmailResult.success) {
                console.log(`✅ Recipient notification email sent to ${recipient.email}`);
              } else {
                console.log(`⚠️ Recipient notification email failed for ${recipient.email}: ${recipientEmailResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Request email send error (recipient):', e.message);
            }
          }

          if (process.env.ADMIN_EMAIL) {
            const adminHtml = emailTemplates.adminRequestNotification(
              recipient?.name || 'Unknown Recipient',
              recipient?.email || 'unknown',
              medicine.donor?.name || 'Unknown Donor',
              medicine.donor?.email || 'unknown',
              medicine.name,
              medicine.quantity
            );
            try {
              const adminResult = await sendEmail(
                process.env.ADMIN_EMAIL,
                'Admin Notification - MedShare',
                `
                  <h2>Admin Notification</h2>
                  <p>A new donation/request requires your attention</p>
                  <ul>
                    <li><strong>Medicine:</strong> ${medicine?.name || 'Unknown'}</li>
                    <li><strong>Recipient:</strong> ${recipient?.name || 'Unknown'} (${recipient?.email || 'N/A'})</li>
                    <li><strong>Donor:</strong> ${medicine?.donor?.name || 'Unknown'} (${medicine?.donor?.email || 'N/A'})</li>
                    <li><strong>Quantity:</strong> ${medicine?.quantity ?? 'N/A'}</li>
                  </ul>
                `
              );
              if (adminResult.success) {
                console.log(`✅ Admin notified at ${process.env.ADMIN_EMAIL} about new request`);
              } else {
                console.log(`⚠️ Admin request notification failed for ${process.env.ADMIN_EMAIL}: ${adminResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Request email send error (admin):', e.message);
            }
          }
        } catch (emailError) {
          console.error('Email Error: Failed to send request notification emails:', emailError.message);
        }
      })();
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Recipient: get own requests
router.get('/my', authRequired, requireRole(['RECIPIENT']), async (req, res) => {
  try {
    const requests = await MedicineRequest.find({ recipientId: req.user.id })
      .populate('medicineId', 'name expiryDate quantity donor')
      .sort('-requestedAt');
    return res.json(requests);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin: get all requests
router.get('/', authRequired, requireRole(['ADMIN']), async (req, res) => {
  try {
    const requests = await MedicineRequest.find()
      .populate('medicineId', 'name donor')
      .populate('recipientId', 'name email')
      .sort('-requestedAt');
    // Enrich response with admin context metadata (no schema change)
    const enriched = requests.map((r) => {
      const obj = r.toObject();
      return {
        ...obj,
        adminId: req.user?.id || null,
        adminEmail: process.env.ADMIN_EMAIL || null,
        status: obj.status,
        timestamp: obj.processedAt || obj.requestedAt || new Date()
      };
    });
    return res.json(enriched);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin: approve
router.patch('/:id/approve', authRequired, requireRole(['ADMIN']), async (req, res) => {
  try {
    const reqDoc = await MedicineRequest.findById(req.params.id)
      .populate('medicineId', 'name description quantity expiryDate status')
      .populate('recipientId', 'name email');
    
    if (!reqDoc) return res.status(404).json({ message: 'Request not found' });
    if (reqDoc.status !== 'PENDING') return res.status(400).json({ message: 'Request already processed' });

    // Decrement inventory and update medicine availability
    const medicine = await Medicine.findById(reqDoc.medicineId._id);
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });

    if ((medicine.quantity ?? 0) <= 0) {
      return res.status(400).json({ message: 'Medicine out of stock' });
    }

    medicine.quantity = Math.max(0, (medicine.quantity || 0) - 1);
    // Mark unavailable if <= 0, otherwise claimed
    medicine.status = medicine.quantity === 0 ? 'EXPIRED' : 'CLAIMED';
    await medicine.save();

    // Update request status
    reqDoc.status = 'APPROVED';
    reqDoc.processedAt = new Date();
    await reqDoc.save();
    
    // Respond immediately after DB success
    res.json({ message: 'Request approved', adminEmail: process.env.ADMIN_EMAIL || null });

    // Fire-and-forget emails to recipient, donor and admin
    setImmediate(() => {
      (async () => {
        try {
          if (reqDoc.recipientId && reqDoc.recipientId.email) {
            const htmlMessage = emailTemplates.approvalNotification(
              reqDoc.recipientId.name,
              reqDoc.medicineId.name,
              medicine.quantity,
              'approved'
            );
            try {
              const emailResult = await sendEmail(
                reqDoc.recipientId.email,
                'Request Approved - MedShare',
                `
                  <h2>Request Approved</h2>
                  <p>Your request has been approved</p>
                  <p><strong>Medicine:</strong> ${reqDoc?.medicineId?.name || 'Unknown'}</p>
                `
              );
              if (emailResult.success) {
                console.log(`✅ Request approval email sent to ${reqDoc.recipientId.email}`);
              } else {
                console.log(`⚠️ Request approval email failed for ${reqDoc.recipientId.email}: ${emailResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Approval email send error (recipient):', e.message);
            }
          }

          try {
            const donorUser = await User.findById(medicine.donor);
            if (donorUser?.email) {
              const donorHtml = `
                <h2 style=\"margin-top:0;color:#2b8a3e\">✅ Request Approved</h2>
                <p>A request for your donated medicine <strong>${reqDoc.medicineId.name}</strong> was approved.</p>`;
              try {
                await sendEmail(
                  donorUser.email,
                  'Donation Approved - MedShare',
                  `
                    <h2>Donation Approved</h2>
                    <p>Your donated medicine has been approved by admin</p>
                    <p><strong>Medicine:</strong> ${reqDoc?.medicineId?.name || 'Unknown'}</p>
                  `
                );
              } catch (e) {
                console.error('Approval email send error (donor):', e.message);
              }
            }
          } catch (_) {}

          if (process.env.ADMIN_EMAIL) {
            const adminHtml = `
              <h2 style=\"margin-top:0;color:#2b8a3e\">✅ Request Approved</h2>
              <ul>
                <li><strong>Medicine:</strong> ${reqDoc.medicineId?.name || 'Unknown'}</li>
                <li><strong>Recipient:</strong> ${reqDoc.recipientId?.name || 'Unknown'} (${reqDoc.recipientId?.email || 'N/A'})</li>
                <li><strong>Processed At:</strong> ${reqDoc.processedAt?.toISOString() || new Date().toISOString()}</li>
              </ul>`;
            try {
              await sendEmail(
                process.env.ADMIN_EMAIL,
                'Admin Notification - MedShare',
                `
                  <h2>Admin Notification</h2>
                  <p>A new donation/request requires your attention</p>
                  <ul>
                    <li><strong>Medicine:</strong> ${reqDoc?.medicineId?.name || 'Unknown'}</li>
                    <li><strong>Recipient:</strong> ${reqDoc?.recipientId?.name || 'Unknown'} (${reqDoc?.recipientId?.email || 'N/A'})</li>
                    <li><strong>Processed At:</strong> ${reqDoc?.processedAt?.toISOString() || new Date().toISOString()}</li>
                  </ul>
                `
              );
            } catch (e) {
              console.error('Approval email send error (admin):', e.message);
            }
          }
        } catch (emailError) {
          console.error('Email Error: Failed to send request approval notifications:', emailError.message);
        }
      })();
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin: reject
router.patch('/:id/reject', authRequired, requireRole(['ADMIN']), async (req, res) => {
  try {
    const reqDoc = await MedicineRequest.findById(req.params.id)
      .populate('medicineId', 'name description quantity expiryDate')
      .populate('recipientId', 'name email');
    
    if (!reqDoc) return res.status(404).json({ message: 'Request not found' });
    if (reqDoc.status !== 'PENDING') return res.status(400).json({ message: 'Request already processed' });
    
    reqDoc.status = 'REJECTED';
    reqDoc.processedAt = new Date();
    await reqDoc.save();
    
    // Respond immediately after DB success
    res.json({ 
      message: 'Request rejected',
      adminId: req.user?.id || null,
      adminEmail: process.env.ADMIN_EMAIL || null,
      status: reqDoc.status,
      timestamp: reqDoc.processedAt
    });

    // Fire-and-forget emails for rejection
    setImmediate(() => {
      (async () => {
        try {
          if (reqDoc.recipientId && reqDoc.recipientId.email) {
            const htmlMessage = emailTemplates.approvalNotification(
              reqDoc.recipientId.name,
              reqDoc.medicineId.name,
              reqDoc.medicineId.quantity,
              'rejected'
            );
            try {
              const emailResult = await sendEmail(reqDoc.recipientId.email, 'Request Rejected - MedShare', htmlMessage);
              if (emailResult.success) {
                console.log(`✅ Request rejection email sent to ${reqDoc.recipientId.email}`);
              } else {
                console.log(`⚠️ Request rejection email failed for ${reqDoc.recipientId.email}: ${emailResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Rejection email send error (recipient):', e.message);
            }
          }

          if (process.env.ADMIN_EMAIL) {
            const adminHtml = `
              <h2 style=\"margin-top:0;color:#dc2626\">❌ Request Rejected</h2>
              <p>The following request was rejected by admin <strong>${req.user?.id || ''}</strong>.</p>
              <ul>
                <li><strong>Medicine:</strong> ${reqDoc.medicineId?.name || 'Unknown'}</li>
                <li><strong>Recipient:</strong> ${reqDoc.recipientId?.name || 'Unknown'} (${reqDoc.recipientId?.email || 'N/A'})</li>
                <li><strong>Status:</strong> REJECTED</li>
                <li><strong>Processed At:</strong> ${reqDoc.processedAt?.toISOString() || new Date().toISOString()}</li>
              </ul>`;
            try {
              const adminResult = await sendEmail(process.env.ADMIN_EMAIL, 'Admin Confirmation: Request Rejected - MedShare', adminHtml);
              if (adminResult.success) {
                console.log(`✅ Admin rejection confirmation sent to ${process.env.ADMIN_EMAIL}`);
              } else {
                console.log(`⚠️ Admin rejection email failed for ${process.env.ADMIN_EMAIL}: ${adminResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Rejection email send error (admin):', e.message);
            }
          }
        } catch (emailError) {
          console.error('Email Error: Failed to send request rejection notification:', emailError.message);
        }
      })();
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;


