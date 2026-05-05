import express from 'express';
import Medicine from '../models/Medicine.js';
import MedicineRequest from '../models/MedicineRequest.js';
import User from '../models/User.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { sendEmail, emailTemplates } from '../utils/email.js';

const router = express.Router();

// All admin routes require ADMIN role
router.use(authRequired, requireRole(['ADMIN']));

// Get all medicines with status
router.get('/medicines', async (req, res) => {
  try {
    const docs = await Medicine.find()
      .populate('donor', 'name email')
      .populate('requestedBy', 'name email')
      .sort('-createdAt');

    // Enrich response with safe defaults to avoid missing-field issues on the admin dashboard
    const medicines = docs.map((m) => {
      const obj = m.toObject();
      const safeDonor = obj.donor && (obj.donor.name || obj.donor.email)
        ? { name: obj.donor.name || 'Unknown', email: obj.donor.email || 'N/A', _id: obj.donor._id }
        : { name: 'Unknown', email: 'N/A' };
      const safeRequestedBy = obj.requestedBy && (obj.requestedBy.name || obj.requestedBy.email)
        ? { name: obj.requestedBy.name || 'Unknown', email: obj.requestedBy.email || 'N/A', _id: obj.requestedBy._id }
        : undefined;

      return {
        ...obj,
        name: obj.name || 'Unknown Medicine',
        status: obj.status || 'AVAILABLE',
        quantity: typeof obj.quantity === 'number' ? obj.quantity : 0,
        expiryDate: obj.expiryDate || obj.createdAt || new Date(),
        donor: safeDonor,
        requestedBy: safeRequestedBy
      };
    });

    return res.json(medicines);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('name email role createdAt isActive')
      .sort('-createdAt');

    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Approve or reject medicine request
router.put('/approve/:id', async (req, res) => {
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
      medicine.status = 'AVAILABLE';
      await medicine.save();

      // Notify recipient, donor, and admin
      try {
        const [recipient, donorUser] = await Promise.all([
          medicine.requestedBy ? User.findById(medicine.requestedBy) : null,
          medicine.donor ? User.findById(medicine.donor) : null
        ]);

        if (recipient?.email) {
          const html = emailTemplates.approvalNotification(
            recipient.name,
            medicine.name,
            medicine.quantity,
            'approved'
          );
          await sendEmail(
            recipient.email,
            'Request Approved - MedShare',
            `
              <h2>Request Approved</h2>
              <p>Your request has been approved</p>
              <p><strong>Medicine:</strong> ${medicine?.name || 'Unknown'}</p>
            `
          );
        }

        if (donorUser?.email) {
          const donorHtml = `
            <h2 style=\"margin-top:0;color:#2b8a3e\">✅ Request Approved</h2>
            <p>Your donated medicine <strong>${medicine.name}</strong> has an approved request.</p>
            <ul>
              <li><strong>Quantity Remaining:</strong> ${medicine.quantity ?? 'N/A'}</li>
            </ul>`;
          await sendEmail(
            donorUser.email,
            'Donation Approved - MedShare',
            `
              <h2>Donation Approved</h2>
              <p>Your donated medicine has been approved by admin</p>
              <p><strong>Medicine:</strong> ${medicine?.name || 'Unknown'}</p>
            `
          );
        }

        if (process.env.ADMIN_EMAIL) {
          const adminHtml = `
            <h2 style=\"margin-top:0;color:#2b8a3e\">✅ Request Approved</h2>
            <p>Admin confirmation: A request was approved.</p>
            <ul>
              <li><strong>Medicine:</strong> ${medicine.name}</li>
              <li><strong>Recipient:</strong> ${recipient?.name || 'Unknown'} (${recipient?.email || 'N/A'})</li>
              <li><strong>Donor:</strong> ${donorUser?.name || 'Unknown'} (${donorUser?.email || 'N/A'})</li>
              <li><strong>Processed At:</strong> ${new Date().toISOString()}</li>
            </ul>`;
          await sendEmail(
            process.env.ADMIN_EMAIL,
            'Admin Notification - MedShare',
            `
              <h2>Admin Notification</h2>
              <p>A new donation/request requires your attention</p>
              <ul>
                <li><strong>Medicine:</strong> ${medicine?.name || 'Unknown'}</li>
                <li><strong>Recipient:</strong> ${recipient?.name || 'Unknown'} (${recipient?.email || 'N/A'})</li>
                <li><strong>Donor:</strong> ${donorUser?.name || 'Unknown'} (${donorUser?.email || 'N/A'})</li>
                <li><strong>Processed At:</strong> ${new Date().toISOString()}</li>
              </ul>
            `
          );
        }
      } catch (emailError) {
        console.error('Email Error (admin approve):', emailError.message);
      }

      return res.json({ message: 'Medicine request approved', adminEmail: process.env.ADMIN_EMAIL || null });
    } else {
      // For reject, capture recipient before clearing
      const recipient = medicine.requestedBy ? await User.findById(medicine.requestedBy) : null;
      const donorUser = medicine.donor ? await User.findById(medicine.donor) : null;

      medicine.status = 'REJECTED';
      medicine.requestedBy = undefined;
      medicine.requestedAt = undefined;
      await medicine.save();

      // Notify recipient, donor, and admin
      try {
        if (recipient?.email) {
          const html = emailTemplates.approvalNotification(
            recipient.name,
            medicine.name,
            medicine.quantity,
            'rejected'
          );
          await sendEmail(recipient.email, 'Request Rejected - MedShare', html);
        }

        if (donorUser?.email) {
          const donorHtml = `
            <h2 style=\"margin-top:0;color:#dc2626\">❌ Request Rejected</h2>
            <p>The request for your donated medicine <strong>${medicine.name}</strong> was rejected.</p>`;
          await sendEmail(donorUser.email, 'Donation Request Rejected - MedShare', donorHtml);
        }

        if (process.env.ADMIN_EMAIL) {
          const adminHtml = `
            <h2 style=\"margin-top:0;color:#dc2626\">❌ Request Rejected</h2>
            <p>Admin confirmation: A request was rejected.</p>
            <ul>
              <li><strong>Medicine:</strong> ${medicine.name}</li>
              <li><strong>Recipient:</strong> ${recipient?.name || 'Unknown'} (${recipient?.email || 'N/A'})</li>
              <li><strong>Donor:</strong> ${donorUser?.name || 'Unknown'} (${donorUser?.email || 'N/A'})</li>
              <li><strong>Processed At:</strong> ${new Date().toISOString()}</li>
            </ul>`;
          await sendEmail(process.env.ADMIN_EMAIL, 'Admin Confirmation: Request Rejected - MedShare', adminHtml);
        }
      } catch (emailError) {
        console.error('Email Error (admin reject):', emailError.message);
      }

      return res.json({ message: 'Medicine request rejected', adminEmail: process.env.ADMIN_EMAIL || null });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
 
// Analytics overview
router.get('/analytics/overview', async (req, res) => {
  try {
    const [totalDonations, totalRequests, approvedCount, rejectedCount] = await Promise.all([
      Medicine.countDocuments({}),
      MedicineRequest.countDocuments({}),
      MedicineRequest.countDocuments({ status: 'APPROVED' }),
      MedicineRequest.countDocuments({ status: 'REJECTED' })
    ]);

    return res.json({
      totalDonations,
      totalRequests,
      approvals: approvedCount,
      rejections: rejectedCount
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Admin statistics summary
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalDonors,
      totalRecipients,
      totalDonations,
      totalRequests,
      approved,
      rejected,
      availableMedicines,
      expiredMedicines
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: 'DONOR' }),
      User.countDocuments({ role: 'RECIPIENT' }),
      Medicine.countDocuments({}),
      MedicineRequest.countDocuments({}),
      MedicineRequest.countDocuments({ status: 'APPROVED' }),
      MedicineRequest.countDocuments({ status: 'REJECTED' }),
      Medicine.countDocuments({ status: 'AVAILABLE' }),
      Medicine.countDocuments({ status: 'EXPIRED' })
    ]);

    return res.json({
      totalUsers,
      totalDonors,
      totalRecipients,
      totalDonations,
      totalRequests,
      approved,
      rejected,
      availableMedicines,
      expiredMedicines
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});