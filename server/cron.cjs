const cron = require('node-cron');
const { sendWhatsAppMessage } = require('./whatsapp.cjs');

function initCronJobs(pool) {
    // Run every day at 8:00 AM
    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Starting daily morning task summary job...');
        try {
            // Load target phone numbers from env
            const targetNumbers = [
                process.env.WHATSAPP_TARGET_NUMBER_1,
                process.env.WHATSAPP_TARGET_NUMBER_2
            ].filter(Boolean);

            if (targetNumbers.length === 0) {
                console.warn('[Cron] No target WhatsApp numbers configured. Skipping daily summary.');
                return;
            }

            // Get today's date in YYYY-MM-DD
            const today = new Date().toISOString().split('T')[0];
            
            // Query inquiries scheduled for today
            const [inquiries] = await pool.query(
                `SELECT i.ticket_no, i.full_name, i.location, i.preferred_time, p.full_name AS employee_name
                 FROM inquiries i
                 LEFT JOIN profiles p ON i.assigned_employee_id = p.id
                 WHERE i.preferred_date = ? AND i.assigned_employee_id IS NOT NULL`,
                [today]
            );

            // Query installations scheduled for today
            const [installations] = await pool.query(
                `SELECT i.ticket_no, i.full_name, i.location, i.preferred_time, i.installation_type, p.full_name AS employee_name
                 FROM installations i
                 LEFT JOIN profiles p ON i.assigned_employee_id = p.id
                 WHERE i.preferred_date = ? AND i.assigned_employee_id IS NOT NULL`,
                [today]
            );

            // Group tasks by employee
            const tasksByEmployee = {};

            inquiries.forEach(task => {
                const emp = task.employee_name || 'Unassigned';
                if (!tasksByEmployee[emp]) tasksByEmployee[emp] = [];
                tasksByEmployee[emp].push(`• [Survey] ${task.ticket_no || 'No Ticket'} - ${task.full_name} (${task.location}) @ ${task.preferred_time || 'Anytime'}`);
            });

            installations.forEach(task => {
                const emp = task.employee_name || 'Unassigned';
                if (!tasksByEmployee[emp]) tasksByEmployee[emp] = [];
                tasksByEmployee[emp].push(`• [Install] ${task.ticket_no || 'No Ticket'} - ${task.installation_type} for ${task.full_name} (${task.location}) @ ${task.preferred_time || 'Anytime'}`);
            });

            // Format message
            let message = `*📅 Daily Tasks - ${today}*\n\n`;
            
            const employees = Object.keys(tasksByEmployee);
            if (employees.length === 0) {
                message += "No tasks or installations scheduled for today! 🎉";
            } else {
                employees.forEach(emp => {
                    message += `*${emp}'s Schedule:*\n`;
                    message += tasksByEmployee[emp].join('\n') + '\n\n';
                });
            }

            // Send messages
            for (const number of targetNumbers) {
                await sendWhatsAppMessage(number, message);
            }

        } catch (error) {
            console.error('[Cron] Error running daily morning task summary:', error);
        }
    });
}

module.exports = { initCronJobs };
