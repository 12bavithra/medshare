import express from 'express';
import Medicine from '../models/Medicine.js';
import User from '../models/User.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { sendEmail, emailTemplates } from '../utils/email.js';

const router = express.Router();

// Utility function to check and auto-expire medicines
async function checkAndExpireMedicines() {
  try {
    const now = new Date();
    const expiredMedicines = await Medicine.find({
      status: { $in: ['AVAILABLE', 'CLAIMED'] },
      expiryDate: { $lt: now }
    });

    if (expiredMedicines.length > 0) {
      await Medicine.updateMany(
        { _id: { $in: expiredMedicines.map(m => m._id) } },
        { status: 'EXPIRED' }
      );
      console.log(`📌 Auto-expired ${expiredMedicines.length} medicines`);
    }
  } catch (error) {
    console.error('Error auto-expiring medicines:', error);
  }
}

// Add medicine (DONOR only)
router.post('/add', authRequired, requireRole(['DONOR']), async (req, res) => {
  try {
    const { name, description, expiryDate, quantity, category } = req.body;
    
    if (!name || !expiryDate || !quantity) {
      return res.status(400).json({ 
        message: 'name, expiryDate, and quantity are required' 
      });
    }
    // Merge into existing stock if same donor+name+expiry exists, else create
    const existing = await Medicine.findOne({
      donor: req.user.id,
      name: name,
      expiryDate: new Date(expiryDate),
      status: 'PENDING'
    });

    let medicine;
    if (existing) {
      existing.quantity += parseInt(quantity);
      // Keep the later expiry if changed
      const newExp = new Date(expiryDate);
      if (newExp > existing.expiryDate) {
        existing.expiryDate = newExp;
      }
      medicine = await existing.save();
    } else {
      medicine = await Medicine.create({
        name,
        description,
        category,
        expiryDate: new Date(expiryDate),
        quantity: parseInt(quantity),
        donor: req.user.id,
        status: 'PENDING'
      });
    }

    // Respond immediately after DB success
    res.status(201).json({
      message: 'Medicine added successfully',
      medicine: {
        id: medicine._id,
        name: medicine.name,
        description: medicine.description,
        expiryDate: medicine.expiryDate,
        quantity: medicine.quantity,
        status: medicine.status
      }
    });

    // Fire-and-forget email notifications to donor and admin
    setImmediate(() => {
      (async () => {
        try {
          const donor = await User.findById(req.user.id);
          if (donor && donor.email) {
            const htmlMessage = emailTemplates.donationConfirmation(
              donor.name,
              medicine.name,
              medicine.quantity,
              new Date(medicine.expiryDate).toLocaleDateString()
            );
            try {
              const emailResult = await sendEmail(donor.email, 'Donation Successful - MedShare', htmlMessage);
              if (emailResult.success) {
                console.log(`✅ Donation confirmation email sent to ${donor.email}`);
              } else {
                console.log(`⚠️ Donation confirmation email failed for ${donor.email}: ${emailResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Donation email send error (donor):', e.message);
            }
          }

          if (process.env.ADMIN_EMAIL) {
            const adminHtml = emailTemplates.adminDonationNotification(
              donor?.name || 'Unknown Donor',
              donor?.email || 'unknown',
              medicine.name,
              medicine.quantity,
              new Date(medicine.expiryDate).toLocaleDateString()
            );
            try {
              const adminResult = await sendEmail(process.env.ADMIN_EMAIL, 'New Donation Submitted - MedShare', adminHtml);
              if (adminResult.success) {
                console.log(`✅ Admin notified at ${process.env.ADMIN_EMAIL} about new donation`);
              } else {
                console.log(`⚠️ Admin notification failed for ${process.env.ADMIN_EMAIL}: ${adminResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Donation email send error (admin):', e.message);
            }
          }
        } catch (emailError) {
          console.error('Email Error: Failed to send donation confirmation:', emailError.message);
        }
      })();
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// List all available medicines (all authenticated users)
router.get('/', authRequired, async (req, res) => {
  try {
    // First, check and auto-expire medicines
    await checkAndExpireMedicines();

    const { name, category, expiryBefore, expiryAfter } = req.query;
    const filter = { status: 'AVAILABLE' };
    
    // Add search filters
    if (name) filter.name = { $regex: new RegExp(name, 'i') };
    if (category) filter.category = { $regex: new RegExp(category, 'i') };
    if (expiryBefore || expiryAfter) {
      filter.expiryDate = {};
      if (expiryBefore) filter.expiryDate.$lte = new Date(expiryBefore);
      if (expiryAfter) filter.expiryDate.$gte = new Date(expiryAfter);
    }

    // Exclude expired medicines by adding expiry date filter
    const now = new Date();
    filter.expiryDate = { ...filter.expiryDate, $gt: now };

    const docs = await Medicine.find(filter)
      .populate('donor', 'name email')
      .select('name description category expiryDate quantity status donor createdAt')
      .sort('-createdAt');

    // Normalize donor to avoid nulls on frontend
    const medicines = docs.map((m) => {
      const obj = m.toObject();
      const safeDonor = obj.donor && (obj.donor.name || obj.donor.email)
        ? { name: obj.donor.name || 'Unknown', email: obj.donor.email || 'N/A', _id: obj.donor._id }
        : { name: 'Unknown', email: 'N/A' };
      return { ...obj, donor: safeDonor };
    });

    return res.json(medicines);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Search medicines with filters (available only)
router.get('/search', authRequired, async (req, res) => {
  try {
    const { name, category, expiryBefore } = req.query;
    const filter = { status: 'AVAILABLE' };
    
    // Add search filters
    if (name) {
      filter.name = { $regex: new RegExp(name, 'i') };
    }
    if (category) {
      filter.category = { $regex: new RegExp(category, 'i') };
    }
    if (expiryBefore) {
      filter.expiryDate = { $lte: new Date(expiryBefore) };
    }

    // Exclude expired medicines by adding expiry date filter
    const now = new Date();
    filter.expiryDate = { ...filter.expiryDate, $gt: now };

    const docs = await Medicine.find(filter)
      .populate('donor', 'name email')
      .select('name description category expiryDate quantity status donor createdAt')
      .sort('-createdAt');

    const medicines = docs.map((m) => {
      const obj = m.toObject();
      const safeDonor = obj.donor && (obj.donor.name || obj.donor.email)
        ? { name: obj.donor.name || 'Unknown', email: obj.donor.email || 'N/A', _id: obj.donor._id }
        : { name: 'Unknown', email: 'N/A' };
      return { ...obj, donor: safeDonor };
    });

    return res.json({
      medicines,
      count: medicines.length,
      filters: { name, category, expiryBefore }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// List medicines donated by the logged-in donor (DONOR only)
router.get('/donor/medicines', authRequired, requireRole(['DONOR']), async (req, res) => {
  try {
    const medicines = await Medicine.find({ donor: req.user.id })
      .select('name description expiryDate quantity status requestedBy createdAt')
      .sort('-createdAt');

    return res.json(medicines);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Update stock or expiry
router.put('/update/:id', authRequired, requireRole(['DONOR', 'ADMIN']), async (req, res) => {
  try {
    const { quantity, expiryDate, status } = req.body;
    const update = {};
    
    // Validate and set quantity
    if (typeof quantity === 'number' && quantity >= 0) {
      update.quantity = quantity;
    }
    
    // Validate and set expiry date
    if (expiryDate) {
      const newExpiryDate = new Date(expiryDate);
      if (isNaN(newExpiryDate.getTime())) {
        return res.status(400).json({ message: 'Invalid expiry date format' });
      }
      update.expiryDate = newExpiryDate;
    }
    
    // Validate and set status
    if (status && ['PENDING', 'AVAILABLE', 'REJECTED', 'CLAIMED', 'EXPIRED'].includes(status)) {
      update.status = status;
    }

    // Find the medicine first to check permissions
    const existingMedicine = await Medicine.findById(req.params.id);
    if (!existingMedicine) {
      return res.status(404).json({ message: 'Medicine not found' });
    }

    // Check if donor is trying to update their own medicine or if user is admin
    if (req.user.role !== 'ADMIN' && existingMedicine.donor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own medicines' });
    }

    // Update the medicine
    const medicine = await Medicine.findByIdAndUpdate(req.params.id, update, { new: true });
    
    // Auto-expire if quantity is 0
    if (medicine.quantity === 0 && medicine.status !== 'EXPIRED') {
      medicine.status = 'EXPIRED';
      await medicine.save();
    }

    // Auto-expire if past expiry date
    const now = new Date();
    if (medicine.expiryDate < now && medicine.status !== 'EXPIRED') {
      medicine.status = 'EXPIRED';
      await medicine.save();
    }

    return res.json({ 
      message: 'Medicine updated successfully', 
      medicine: {
        id: medicine._id,
        name: medicine.name,
        description: medicine.description,
        category: medicine.category,
        expiryDate: medicine.expiryDate,
        quantity: medicine.quantity,
        status: medicine.status,
        donor: medicine.donor
      }
    });
  } catch (err) {
    console.error('Update medicine error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete medicine (expired/invalid)
router.delete('/:id', authRequired, requireRole(['ADMIN']), async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
    await Medicine.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Medicine removed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// List medicine requests made by the logged-in recipient (RECIPIENT only)
router.get('/recipient/requests', authRequired, requireRole(['RECIPIENT']), async (req, res) => {
  try {
    const medicines = await Medicine.find({ requestedBy: req.user.id })
      .populate('donor', 'name email')
      .select('name description expiryDate quantity status donor requestedAt createdAt')
      .sort('-requestedAt -createdAt');

    return res.json(medicines);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Request a medicine (RECIPIENT only)
router.post('/request/:id', authRequired, requireRole(['RECIPIENT']), async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    
    if (!medicine) {
      return res.status(404).json({ message: 'Medicine not found' });
    }

    if (medicine.status !== 'AVAILABLE') {
      return res.status(400).json({ message: 'Medicine is not available' });
    }

    if (medicine.donor.toString() === req.user.id) {
      return res.status(400).json({ message: 'Cannot request your own medicine' });
    }

    medicine.status = 'CLAIMED';
    medicine.requestedBy = req.user.id;
    medicine.requestedAt = new Date();
    await medicine.save();

    // Respond immediately after DB success
    res.json({
      message: 'Medicine requested successfully',
      medicine: {
        id: medicine._id,
        name: medicine.name,
        status: medicine.status,
        requestedAt: medicine.requestedAt
      }
    });

    // Fire-and-forget email notifications to donor and recipient
    setImmediate(() => {
      (async () => {
        try {
          const [donor, recipient] = await Promise.all([
            User.findById(medicine.donor),
            User.findById(req.user.id)
          ]);

          if (donor && donor.email) {
            const donorHtmlMessage = emailTemplates.donorRequestNotification(
              donor.name,
              recipient?.name,
              medicine.name,
              medicine.quantity
            );
            try {
              const donorEmailResult = await sendEmail(donor.email, 'Someone Requested Your Donation - MedShare', donorHtmlMessage);
              if (donorEmailResult.success) {
                console.log(`✅ Donor notification email sent to ${donor.email}`);
              } else {
                console.log(`⚠️ Donor notification email failed for ${donor.email}: ${donorEmailResult.fallbackMessage}`);
              }
            } catch (e) {
              console.error('Request email send error (donor):', e.message);
            }
          }

          if (recipient && recipient.email) {
            const recipientHtmlMessage = emailTemplates.requestNotification(
              recipient.name,
              donor?.name,
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

// Admin approve medicine request (ADMIN only)
router.put('/approve/:id', authRequired, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be approve or reject' });
    }

    const medicine = await Medicine.findById(req.params.id);
    
    if (!medicine) {
      return res.status(404).json({ message: 'Medicine not found' });
    }

    if (action === 'approve') {
      // Deduct 1 by default if unknown, or ensure not below zero
      const deductQty = Math.max(1, 1);
      medicine.quantity = Math.max(0, (medicine.quantity || 0) - deductQty);
      medicine.status = medicine.quantity === 0 ? 'EXPIRED' : 'CLAIMED';
      await medicine.save();
      
      // Respond immediately after DB success
      res.json({ message: 'Medicine request approved' });

      // Fire-and-forget email notification to recipient
      setImmediate(() => {
        (async () => {
          try {
            const recipient = await User.findById(medicine.requestedBy);
            if (recipient && recipient.email) {
              const htmlMessage = emailTemplates.approvalNotification(
                recipient.name,
                medicine.name,
                medicine.quantity,
                'approved'
              );
              try {
                const emailResult = await sendEmail(recipient.email, 'Request Approved - MedShare', htmlMessage);
                if (emailResult.success) {
                  console.log(`✅ Approval notification email sent to ${recipient.email}`);
                } else {
                  console.log(`⚠️ Approval notification email failed for ${recipient.email}: ${emailResult.fallbackMessage}`);
                }
              } catch (e) {
                console.error('Approval email send error (recipient):', e.message);
              }
            }
          } catch (emailError) {
            console.error('Email Error: Failed to send approval notification:', emailError.message);
          }
        })();
      });
    } else {
      // Get recipient before clearing the data
      const recipient = await User.findById(medicine.requestedBy);
      
      medicine.status = 'AVAILABLE';
      medicine.requestedBy = undefined;
      medicine.requestedAt = undefined;
      await medicine.save();
      
      // Respond immediately after DB success
      res.json({ message: 'Medicine request rejected' });

      // Fire-and-forget email notification to recipient
      setImmediate(() => {
        (async () => {
          try {
            if (recipient && recipient.email) {
              const htmlMessage = emailTemplates.approvalNotification(
                recipient.name,
                medicine.name,
                medicine.quantity,
                'rejected'
              );
              try {
                const emailResult = await sendEmail(recipient.email, 'Request Rejected - MedShare', htmlMessage);
                if (emailResult.success) {
                  console.log(`✅ Rejection notification email sent to ${recipient.email}`);
                } else {
                  console.log(`⚠️ Rejection notification email failed for ${recipient.email}: ${emailResult.fallbackMessage}`);
                }
              } catch (e) {
                console.error('Rejection email send error (recipient):', e.message);
              }
            }
          } catch (emailError) {
            console.error('Email Error: Failed to send rejection notification:', emailError.message);
          }
        })();
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
