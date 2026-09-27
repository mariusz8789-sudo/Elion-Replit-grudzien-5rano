import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download } from "lucide-react";
import { format } from "date-fns";
import type { Booking, Company } from "@shared/schema";

interface InvoiceGeneratorProps {
  booking: Booking;
  company?: Company;
}

export default function InvoiceGenerator({ booking, company }: InvoiceGeneratorProps) {
  const generatePDF = () => {
    const invoiceHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Invoice #${booking.id.slice(0, 8)}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .invoice-title { font-size: 32px; font-weight: bold; color: #1f2937; }
          .company-info { text-align: right; }
          .section { margin: 30px 0; }
          .section-title { font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #374151; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .info-item { padding: 10px; background: #f9fafb; border-radius: 4px; }
          .info-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
          .info-value { font-size: 14px; color: #1f2937; font-weight: 500; }
          .total-section { background: #1e40af; color: white; padding: 20px; border-radius: 8px; margin-top: 30px; }
          .total-label { font-size: 16px; }
          .total-amount { font-size: 32px; font-weight: bold; margin-top: 8px; }
          .footer { margin-top: 50px; padding-top: 20px; border-top: 2px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="invoice-title">INVOICE</div>
            <div style="margin-top: 8px; color: #6b7280;">
              #${booking.id.slice(0, 8).toUpperCase()}
            </div>
          </div>
          <div class="company-info">
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">
              ${company?.name || "Point to Point"}
            </div>
            <div style="color: #6b7280; font-size: 14px;">
              ${company?.email || "contact@point2point.com"}<br>
              ${company?.phone || "+1 (555) 123-4567"}<br>
              ${company?.address || ""}
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Invoice Details</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Issue Date</div>
              <div class="info-value">${format(new Date(booking.createdAt), "MMMM d, yyyy")}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Status</div>
              <div class="info-value" style="text-transform: capitalize;">${booking.status}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Service Details</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Pickup Address</div>
              <div class="info-value">${booking.pickupAddress}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Delivery Address</div>
              <div class="info-value">${booking.deliveryAddress}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Pickup Date</div>
              <div class="info-value">${format(new Date(booking.pickupDate), "MMMM d, yyyy HH:mm")}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Distance</div>
              <div class="info-value">${booking.estimatedDistance} km</div>
            </div>
          </div>
        </div>

        ${booking.notes ? `
        <div class="section">
          <div class="section-title">Notes</div>
          <div style="padding: 15px; background: #f9fafb; border-radius: 4px; color: #374151;">
            ${booking.notes}
          </div>
        </div>
        ` : ''}

        <div class="total-section">
          <div class="total-label">Total Amount Due</div>
          <div class="total-amount">$${booking.totalPrice}</div>
          <div style="margin-top: 12px; font-size: 14px; opacity: 0.9;">
            Payment Status: ${booking.paymentStatus === 'captured' ? 'Paid' : 'Pending'}
          </div>
        </div>

        <div class="footer">
          <p>Thank you for choosing our services!</p>
          <p>Point to Point - Professional Moving & Transport Services</p>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([invoiceHTML], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${booking.id.slice(0, 8)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Card data-testid="invoice-generator">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Invoice
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={generatePDF} className="w-full" data-testid="button-download-invoice">
          <Download className="w-4 h-4 mr-2" />
          Download Invoice (HTML)
        </Button>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Invoice #{booking.id.slice(0, 8).toUpperCase()}
        </p>
      </CardContent>
    </Card>
  );
}
