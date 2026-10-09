import { ContactSalesService } from './contact-sales.service.js';
import { ApiResponse } from '../../utils/api-response.js';

export class ContactSalesController {
  static async submitInquiry(request, reply) {
    const { name, workEmail, company, companySize, message } = request.body;

    const inquiry = await ContactSalesService.submitInquiry({
      name,
      workEmail,
      company,
      companySize,
      message
    });

    return ApiResponse.success(reply, 201, 'Thank you for contacting sales. Our team will reach out shortly.', {
      inquiryId: inquiry._id
    });
  }
}
