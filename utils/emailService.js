const SibApiV3Sdk = require('sib-api-v3-sdk');
require('dotenv').config();

// Configure API key authorization
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = {
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@SPEMS.com',
      name: process.env.BREVO_SENDER_NAME || 'Smart Project Earnings Management System'
    };
    sendSmtpEmail.subject = 'Password Reset Request';
    sendSmtpEmail.htmlContent = `
      <p>You have requested to reset your password. Click the link below to set a new password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

const sendTemporaryPasswordEmail = async (email, tempPassword) => {
  try {
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = {
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@SPEMS.com',
      name: process.env.BREVO_SENDER_NAME || 'Smart Project Earnings Management System'
    };
    sendSmtpEmail.subject = 'Your Temporary Password';
    sendSmtpEmail.htmlContent = `
      <p>A temporary password has been generated for your account.</p>
      <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      <p>Use this password to login. After logging in, go to Profile Settings and change your password.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error('Error sending temporary password email:', error);
    throw new Error('Failed to send temporary password email');
  }
};

const sendPaymentReminderEmail = async (email, username) => {
  try {
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = {
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@SPEMS.com',
      name: process.env.BREVO_SENDER_NAME || 'Smart Project Earnings Management System'
    };
    sendSmtpEmail.subject = 'Monthly Payment Reminder - SPEMS';
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Monthly Payment Reminder</h2>
        <p>Dear ${username || 'User'},</p>
        <p>This is a reminder that your monthly subscription payment is due.</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Amount:</strong> 15,000 RWF</p>
          <p style="margin: 5px 0;"><strong>Pay To:</strong> NKUSI ENGINEERING GROUP LTD</p>
          <p style="margin: 5px 0;"><strong>Payment Instructions:</strong></p>
          <p style="margin: 5px 0;">Use the phone number <strong>Press *182*8*1*7930391#</strong> when paying to ensure your payment is matched.</p>
        </div>
        <p><strong>Important:</strong> Please make your payment to continue using the system. Your account will be blocked if payment is not received.</p>
        <p>If you have already made the payment, please contact the administrator to update your payment status.</p>
        <p>Thank you for your continued use of SPEMS.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated reminder. Please do not reply to this email.</p>
      </div>
    `;
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error('Error sending payment reminder email:', error);
    throw new Error('Failed to send payment reminder email');
  }
};

const sendPaymentStatusUpdateEmail = async (email, username, { status, paymentMonth, amount, paymentMethod, paidAt }) => {
  try {
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.to = [{ email }];
    sendSmtpEmail.sender = {
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@SPEMS.com',
      name: process.env.BREVO_SENDER_NAME || 'Smart Project Earnings Management System'
    };

    const monthLabel = paymentMonth
      ? new Date(paymentMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      : 'this month';

    const statusLabel = status ? status.toUpperCase() : 'UPDATED';

    sendSmtpEmail.subject = `Payment Status ${statusLabel} - SPEMS`;
    sendSmtpEmail.htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Payment Status Update</h2>
        <p>Dear ${username || 'User'},</p>
        <p>Your payment status for <strong>${monthLabel}</strong> has been updated to: <strong>${statusLabel}</strong>.</p>

        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount ? `${amount} RWF` : '15,000 RWF'}</p>
          <p style="margin: 5px 0;"><strong>Payment Method:</strong> ${paymentMethod || 'MOMO'}</p>
          <p style="margin: 5px 0;"><strong>Paid At:</strong> ${paidAt ? new Date(paidAt).toLocaleString() : '-'}</p>
        </div>

        <h3 style="margin-top: 24px; color: #333;">Payment Instructions</h3>
        <div style="background-color: #eef6ff; padding: 15px; border-radius: 5px; margin: 12px 0;">
          <p style="margin: 5px 0;"><strong>Amount:</strong> 15,000 RWF</p>
          <p style="margin: 5px 0;"><strong>Pay To:</strong> NKUSI ENGINEERING GROUP LTD</p>
          <p style="margin: 5px 0;">Use the phone number <strong>Press *182*8*1*7930391#</strong> when paying to ensure your payment is matched.</p>
        </div>

        <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
      </div>
    `;

    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error('Error sending payment status update email:', error);
    throw new Error('Failed to send payment status update email');
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendTemporaryPasswordEmail,
  sendPaymentReminderEmail,
  sendPaymentStatusUpdateEmail
};
