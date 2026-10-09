import { ContactSales } from './contact-sales.model.js';

export class ContactSalesService {
  static async submitInquiry({ name, workEmail, company, companySize, message }) {
    const inquiry = await ContactSales.create({
      name,
      workEmail,
      company,
      companySize: companySize || null,
      message,
      status: 'pending'
    });

    return inquiry;
  }
}
