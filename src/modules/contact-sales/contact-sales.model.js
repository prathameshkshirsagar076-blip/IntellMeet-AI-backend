import mongoose from 'mongoose';

const contactSalesSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    workEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    company: {
      type: String,
      required: true,
      trim: true
    },
    companySize: {
      type: String,
      default: null,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'contacted', 'closed'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

export const ContactSales = mongoose.model('ContactSales', contactSalesSchema);
