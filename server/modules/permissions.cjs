'use strict';

// Server-side capabilities.
//
// The app's roles were built for service work (admin / team_lead / employee);
// accounting needs finer grain than that — an accountant who may post journals
// but not change tax settings, a storekeeper who may move stock but never see
// a purchase cost. So permissions are expressed as capabilities, roles carry a
// default set, and a per-user grant can add or remove one.
//
// This is enforced here, on the server. A hidden button is not a permission.

const CAPABILITIES = {
    // masters
    'business.manage': 'Change the legal business details, logo and bank details',
    'party.view': 'See customers and suppliers',
    'party.manage': 'Create and edit customers and suppliers',
    'party.merge': 'Merge duplicate parties',
    'item.view': 'See items and selling prices',
    'item.manage': 'Create and edit items',
    'item.cost.view': 'See purchase cost and margin',
    'tax.manage': 'Change tax rates and treatments',
    'series.manage': 'Change document numbering',

    // ledger
    'ledger.view': 'See journals, ledgers and financial reports',
    'ledger.post': 'Post journal entries',
    'ledger.reverse': 'Reverse a posted journal',
    'period.lock': 'Close and reopen accounting periods',

    // documents
    'invoice.view': 'See invoices',
    'invoice.create': 'Raise invoices and credit notes',
    'invoice.cancel': 'Cancel or adjust a posted invoice',
    'payment.view': 'See payments and receipts',
    'payment.record': 'Record receipts and payments',
    'payment.refund': 'Issue refunds',
    'purchase.view': 'See purchase orders and supplier bills',
    'purchase.manage': 'Raise purchase orders and enter supplier bills',

    // stock
    'stock.view': 'See stock on hand',
    'stock.move': 'Issue, transfer and return stock',
    'stock.adjust': 'Adjust stock and approve counts',

    // oversight
    'report.financial': 'Financial reports — P&L, balance sheet, tax',
    'report.operations': 'Operational reports — jobs, technicians, stock',
    'audit.view': 'See the audit history',
};

// Role defaults. `*` means every capability — the owner account.
const ROLE_CAPS = {
    admin: ['*'],

    // An accountant keeps the books but does not set the business's tax policy
    // or reprice the catalogue.
    accountant: [
        'party.view', 'party.manage', 'item.view', 'item.cost.view',
        'ledger.view', 'ledger.post', 'ledger.reverse', 'period.lock',
        'invoice.view', 'invoice.create', 'invoice.cancel',
        'payment.view', 'payment.record',
        'purchase.view', 'purchase.manage',
        'stock.view', 'report.financial', 'report.operations', 'audit.view',
    ],

    // Office staff run the day: quotes, invoices, receipts. No journals, no costs.
    office: [
        'party.view', 'party.manage', 'item.view',
        'invoice.view', 'invoice.create',
        'payment.view', 'payment.record',
        'purchase.view', 'stock.view', 'report.operations',
    ],

    // The store: everything about goods, nothing about money.
    storekeeper: [
        'item.view', 'item.manage', 'item.cost.view',
        'purchase.view', 'purchase.manage',
        'stock.view', 'stock.move', 'stock.adjust',
        'report.operations',
    ],

    // Existing roles keep what they do today and gain only what they need.
    team_lead: [
        'party.view', 'item.view', 'invoice.view', 'payment.view',
        'stock.view', 'stock.move', 'report.operations',
    ],

    employee: [
        'party.view', 'item.view', 'stock.view', 'stock.move',
    ],
};

const CACHE_MS = 30_000;

function createPermissions({ getConn }) {
    const cache = new Map(); // userId → { at, caps: Map<capability, boolean> }

    async function overridesFor(userId) {
        const hit = cache.get(userId);
        if (hit && Date.now() - hit.at < CACHE_MS) return hit.caps;

        const caps = new Map();
        let connection;
        try {
            connection = await getConn();
            const [rows] = await connection.query(
                'SELECT capability, allowed FROM user_permissions WHERE user_id = ?', [userId]
            );
            rows.forEach((r) => caps.set(r.capability, !!r.allowed));
        } catch {
            // A missing table or a database blip must not hand out access it
            // shouldn't, so we fall back to the role defaults only.
        } finally {
            if (connection) connection.release();
        }
        cache.set(userId, { at: Date.now(), caps });
        return caps;
    }

    function roleAllows(role, capability) {
        const list = ROLE_CAPS[role] || [];
        return list.includes('*') || list.includes(capability);
    }

    async function can(user, capability) {
        if (!user) return false;
        if (!CAPABILITIES[capability]) {
            throw new Error(`Unknown capability: ${capability}`);
        }
        const overrides = await overridesFor(user.id);
        if (overrides.has(capability)) return overrides.get(capability);
        return roleAllows(user.role, capability);
    }

    // Express guard. Mount after the existing token check so req.user is set.
    function requireCap(capability) {
        return async (req, res, next) => {
            try {
                if (!req.user) return res.sendStatus(401);
                if (await can(req.user, capability)) return next();
                return res.status(403).json({
                    error: 'You do not have permission for this',
                    capability,
                    needs: CAPABILITIES[capability],
                });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        };
    }

    // What the client may draw. The client uses it to hide what it must not
    // offer; the server still checks every call.
    async function capabilitiesOf(user) {
        if (!user) return [];
        const overrides = await overridesFor(user.id);
        return Object.keys(CAPABILITIES).filter((cap) => (
            overrides.has(cap) ? overrides.get(cap) : roleAllows(user.role, cap)
        ));
    }

    const invalidate = (userId) => { if (userId) cache.delete(userId); else cache.clear(); };

    return { can, requireCap, capabilitiesOf, invalidate, CAPABILITIES, ROLE_CAPS };
}

module.exports = { createPermissions, CAPABILITIES, ROLE_CAPS };
