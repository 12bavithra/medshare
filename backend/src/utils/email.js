import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

// Validate email configuration with clear warnings
const validateEmailConfig = () => {
  const requiredVars = ['RESEND_API_KEY'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.warn('⚠️ Missing Resend configuration in .env');
    console.warn('⚠️ Missing environment variables:', missing.join(', '));
    console.warn('⚠️ Email notifications will be skipped');
    return false;
  }
  
  console.log('✅ Email configuration validated');
  return true;
};

// Main email sending utility with robust error handling
export const sendEmail = async (to, subject, htmlMessage) => {
  console.log(`📧 Attempting to send email to: ${to}`);
  console.log(`📧 Subject: ${subject}`);
  
  try {
    // Validate input parameters
    if (!to || !subject || !htmlMessage) {
      throw new Error('Missing required email parameters: to, subject, or htmlMessage');
    }

    // Check if Resend config is available
    if (!validateEmailConfig()) {
      console.warn('⚠️ Email skipped – missing config');
      return {
        success: false,
        error: 'Missing Resend configuration',
        recipient: to,
        fallbackMessage: 'Email skipped – missing config'
      };
    }
    
    const from = process.env.EMAIL_USER || process.env.EMAIL_FROM || '"MedShare" <noreply@medshare.com>';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #2b8a3e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">💙 MedShare</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Smart Medicine Sharing Platform</p>
          </div>
          <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="line-height: 1.6; color: #333;">${htmlMessage}</div>
            <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
            <p style="color: #6c757d; font-size: 14px; text-align: center; margin: 0;">
              This is an automated message from MedShare. Please do not reply to this email.
            </p>
          </div>
        </div>
      `;

    console.log("Sending email to:", to);
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html
    });
    
    console.log(`✅ Email sent successfully to ${to}`);
    console.log(`📬 Message ID: ${result?.data?.id}`);
    console.log("Email sent successfully via Resend");
    
    return {
      success: true,
      messageId: result?.data?.id,
      recipient: to,
      sender: from
    };
  } catch (error) {
    console.error('Resend Email Error:', error);
    console.error('Email Error Details:', {
      recipient: to,
      subject: subject,
      errorType: error.name,
      errorCode: error.code || 'UNKNOWN'
    });
    
    // Return failure but don't break the application
    return {
      success: false,
      error: error?.message || 'Unknown email error',
      recipient: to,
      fallbackMessage: 'Email skipped – missing config'
    };
  }
};

// Email templates for different events
export const emailTemplates = {
  donationConfirmation: (donorName, medicineName, quantity, expiryDate) => `
    <h2 style="color: #2b8a3e; margin-top: 0;">🎉 Donation Successful!</h2>
    <p>Dear <strong>${donorName}</strong>,</p>
    <p>Thank you for your generous donation to MedShare! Your contribution helps patients in need.</p>
    
    <div style="background-color: #e8f9f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #2b8a3e;">Donation Details:</h3>
      <ul style="margin: 0;">
        <li><strong>Medicine:</strong> ${medicineName}</li>
        <li><strong>Quantity:</strong> ${quantity}</li>
        <li><strong>Expiry Date:</strong> ${expiryDate}</li>
      </ul>
    </div>
    
    <p>Your medicine will be reviewed by our admin team and made available to recipients who need it. You'll be notified when someone requests your donation.</p>
    <p>Thank you for making a difference in healthcare! 💙</p>
  `,

  requestNotification: (recipientName, donorName, medicineName, quantity) => `
    <h2 style="color: #2b8a3e; margin-top: 0;">📋 New Medicine Request</h2>
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>Your medicine request has been submitted successfully!</p>
    
    <div style="background-color: #e8f9f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #2b8a3e;">Request Details:</h3>
      <ul style="margin: 0;">
        <li><strong>Medicine:</strong> ${medicineName}</li>
        <li><strong>Quantity:</strong> ${quantity}</li>
        <li><strong>Donor:</strong> ${donorName}</li>
      </ul>
    </div>
    
    <p>Your request is now pending admin approval. You'll receive another email once it's been reviewed.</p>
    <p>Thank you for using MedShare! 💙</p>
  `,

  donorRequestNotification: (donorName, recipientName, medicineName, quantity) => `
    <h2 style="color: #2b8a3e; margin-top: 0;">📬 Someone Requested Your Donation</h2>
    <p>Dear <strong>${donorName}</strong>,</p>
    <p>Great news! Someone has requested the medicine you donated.</p>
    
    <div style="background-color: #e8f9f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #2b8a3e;">Request Details:</h3>
      <ul style="margin: 0;">
        <li><strong>Medicine:</strong> ${medicineName}</li>
        <li><strong>Quantity:</strong> ${quantity}</li>
        <li><strong>Requested by:</strong> ${recipientName}</li>
      </ul>
    </div>
    
    <p>The request is now pending admin approval. You'll be notified once it's approved and the medicine is delivered.</p>
    <p>Thank you for your generosity! 💙</p>
  `,

  approvalNotification: (recipientName, medicineName, quantity, status) => `
    <h2 style="color: ${status === 'approved' ? '#2b8a3e' : '#dc3545'}; margin-top: 0;">
      ${status === 'approved' ? '✅ Request Approved!' : '❌ Request Rejected'}
    </h2>
    <p>Dear <strong>${recipientName}</strong>,</p>
    <p>Your medicine request has been ${status === 'approved' ? 'approved' : 'rejected'} by our admin team.</p>
    
    <div style="background-color: ${status === 'approved' ? '#e8f9f0' : '#f8d7da'}; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: ${status === 'approved' ? '#2b8a3e' : '#dc3545'};">
        ${status === 'approved' ? 'Approved Request Details:' : 'Rejected Request Details:'}
      </h3>
      <ul style="margin: 0;">
        <li><strong>Medicine:</strong> ${medicineName}</li>
        <li><strong>Quantity:</strong> ${quantity}</li>
        <li><strong>Status:</strong> ${status === 'approved' ? 'Approved' : 'Rejected'}</li>
      </ul>
    </div>
    
    ${status === 'approved' 
      ? '<p>The donor will be contacted to arrange delivery. Please check your dashboard for updates.</p>'
      : '<p>Unfortunately, your request could not be approved at this time. Please try requesting other available medicines.</p>'
    }
    <p>Thank you for using MedShare! 💙</p>
  `,

  // Admin notifications
  adminDonationNotification: (donorName, donorEmail, medicineName, quantity, expiryDate) => `
    <h2 style="color: #2b8a3e; margin-top: 0;">📥 New Donation Submitted</h2>
    <p>A new donation has been added and awaits review.</p>
    <div style="background-color: #e8f9f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #2b8a3e;">Donation Details:</h3>
      <ul style="margin: 0;">
        <li><strong>Donor:</strong> ${donorName} (${donorEmail})</li>
        <li><strong>Medicine:</strong> ${medicineName}</li>
        <li><strong>Quantity:</strong> ${quantity}</li>
        <li><strong>Expiry Date:</strong> ${expiryDate}</li>
      </ul>
    </div>
    <p>Please review and approve in the admin dashboard.</p>
  `,

  adminRequestNotification: (recipientName, recipientEmail, donorName, donorEmail, medicineName, quantity) => `
    <h2 style="color: #2b8a3e; margin-top: 0;">📋 New Medicine Request</h2>
    <p>A new request has been submitted and awaits review.</p>
    <div style="background-color: #e8f9f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #2b8a3e;">Request Details:</h3>
      <ul style="margin: 0;">
        <li><strong>Recipient:</strong> ${recipientName} (${recipientEmail})</li>
        <li><strong>Donor:</strong> ${donorName} (${donorEmail})</li>
        <li><strong>Medicine:</strong> ${medicineName}</li>
        <li><strong>Quantity:</strong> ${quantity}</li>
      </ul>
    </div>
    <p>Please review in the admin dashboard.</p>
  `
};

export default { sendEmail, emailTemplates };
