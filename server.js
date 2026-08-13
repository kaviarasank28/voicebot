const express = require('express');
const app = express();
app.use(express.json());

// In-memory "database" of the target customer, for demo purposes only.
const CUSTOMER_DB = {
  'ACC-88392': {
    name: 'Rahul Sharma',
    loanType: 'Personal Loan',
    overdueAmount: 8499,
    daysPastDue: 12,
    // Accepted verification codes for the mock demo.
    validCodes: ['1234', '1995']
  }
};

// Simple in-memory call log so you can inspect dispositions after a demo run.
const CALL_LOG = [];

app.get('/', (req, res) => {
  res.status(200).send('Kapture Mock Collections Webhook Server is running.');
});

// Main Webhook Endpoint for Vapi
app.post('/webhook', (req, res) => {
  const { message } = req.body || {};

  if (!message) {
    return res.status(200).json({ status: 'acknowledged' });
  }

  // Handle Tool Calls from Vapi
  if (message.type === 'tool-calls') {
    const toolCall = message.toolCalls[0];
    const { name, arguments: args } = toolCall.function;
    const callId = toolCall.id;

    console.log(`[Tool Call Received]: ${name}`, args);

    let result = {};

    switch (name) {
      case 'verify_customer': {
        const customer = CUSTOMER_DB[args.account_id];
        if (customer && customer.validCodes.includes(String(args.verification_code))) {
          result = {
            verified: true,
            customer_name: customer.name,
            overdue_amount: customer.overdueAmount,
            days_past_due: customer.daysPastDue,
            message: 'Identity verified successfully.'
          };
        } else {
          result = { verified: false, message: 'Verification failed. Incorrect code.' };
        }
        break;
      }

      case 'log_promise_to_pay': {
        const ptpId = `PTP-${Math.floor(1000 + Math.random() * 9000)}`;
        CALL_LOG.push({
          type: 'PTP',
          account_id: args.account_id,
          ptp_id: ptpId,
          ptp_date: args.ptp_date,
          amount: args.amount,
          timestamp: new Date().toISOString()
        });
        result = {
          success: true,
          ptp_id: ptpId,
          confirmed_date: args.ptp_date,
          amount: args.amount
        };
        break;
      }

      case 'send_payment_link': {
        result = {
          success: true,
          message: `Payment link sent successfully via ${args.channel} to registered mobile number.`
        };
        break;
      }

      case 'escalate_to_agent': {
        result = {
          success: true,
          escalation_id: `ESC-${Math.floor(1000 + Math.random() * 9000)}`,
          reason: args.reason,
          message: 'Case escalated to a human agent.'
        };
        break;
      }

      case 'mark_disposition': {
        CALL_LOG.push({
          type: 'DISPOSITION',
          account_id: args.account_id,
          status: args.status,
          notes: args.notes || '',
          timestamp: new Date().toISOString()
        });
        result = {
          success: true,
          disposition_logged: args.status,
          timestamp: new Date().toISOString()
        };
        break;
      }

      default:
        result = { success: false, message: 'Unknown function call' };
    }

    // Return format required by Vapi Tool Call response
    return res.status(200).json({
      results: [
        {
          toolCallId: callId,
          result: JSON.stringify(result)
        }
      ]
    });
  }

  // Fallback response for other Vapi event notifications (status-update, end-of-call-report, etc.)
  if (message.type === 'end-of-call-report') {
    console.log('[Call Ended] Summary:', message.summary || 'No summary provided.');
  }

  return res.status(200).json({ status: 'acknowledged' });
});

// Convenience endpoint to inspect what's been logged during testing.
app.get('/logs', (req, res) => {
  res.status(200).json(CALL_LOG);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Kapture Mock Collections Webhook Server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`Call log endpoint: http://localhost:${PORT}/logs`);
});
