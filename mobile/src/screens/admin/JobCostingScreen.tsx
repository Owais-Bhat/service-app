import React, { useCallback, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import {
  addJobCost,
  approveMaterials,
  fetchJobSummary,
  fetchPendingMaterials,
  fetchProfitability,
  fetchTechnicianStock,
  invoiceJob,
  JobSummary,
  PendingMaterials,
  rejectMaterials,
  reverseJobCost,
} from '../../api/adminExtra';
import SectionLabel from '../../components/admin/SectionLabel';
import { rupees } from '../../api/adminBooks';
import { semantic, brand } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { humanize, inr, shortDate, timeAgo } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Mode = 'approvals' | 'margin' | 'vans';
const COST_KINDS = [
  { key: 'labour', label: 'Labour (hours)' },
  { key: 'travel', label: 'Travel (km)' },
  { key: 'subcontract', label: 'Subcontractor' },
  { key: 'other', label: 'Other' },
];

// What each job cost and earned, and the materials waiting for someone to
// approve. Approving takes the goods out of the technician's van and posts the
// cost to the books — the same call the web button makes.
export default function JobCostingScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [view, setView] = useState<Mode>('approvals');
  const vans = useLoader(fetchTechnicianStock, 'Could not load technician stock');
  const [job, setJob] = useState<{ type: string; id: string } | null>(null);
  const [summary, setSummary] = useState<JobSummary | null>(null);
  const [cost, setCost] = useState({ kind: 'labour', desc: '', qty: '1', rate: '', billable: true });
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeWhy, setRemoveWhy] = useState('');
  const pending = useLoader(fetchPendingMaterials, 'Could not load approvals');
  const profit = useLoader(fetchProfitability, 'Could not load job margins');
  const [rejecting, setRejecting] = useState<PendingMaterials | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const reloadAll = useCallback(async () => {
    await Promise.all([pending.reload(), profit.reload()]);
  }, [pending, profit]);

  const approve = (m: PendingMaterials) =>
    Alert.alert('Approve materials?', `${m.employee_name || 'Technician'} · ${m.line_count} lines${m.job ? ` · ${m.job.ticket_no || ''}` : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setBusy(m.id);
          try {
            await approveMaterials(m.id);
            await reloadAll();
          } catch (e) {
            Alert.alert('Could not approve', e instanceof Error ? e.message : 'Try again');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const reject = async () => {
    if (!rejecting) return;
    setBusy(rejecting.id);
    try {
      await rejectMaterials(rejecting.id, reason.trim());
      setRejecting(null);
      setReason('');
      await reloadAll();
    } catch (e) {
      Alert.alert('Could not reject', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const openJob = async (type: string, id: string) => {
    setJob({ type, id });
    setSummary(null);
    setCost({ kind: 'labour', desc: '', qty: '1', rate: '', billable: true });
    try {
      setSummary(await fetchJobSummary(type, id));
    } catch (e) {
      setJob(null);
      Alert.alert('Could not open the job', e instanceof Error ? e.message : 'Try again');
    }
  };

  const refreshJob = async () => {
    if (!job) return;
    setSummary(await fetchJobSummary(job.type, job.id));
    await reloadAll();
  };

  const addCost = async () => {
    if (!job) return;
    if (!(Number(cost.rate) > 0)) return Alert.alert('Rate needed', 'Enter the rate.');
    setBusy('cost');
    try {
      await addJobCost({
        job_type: job.type,
        job_id: job.id,
        kind: cost.kind,
        description: cost.desc.trim(),
        quantity: Number(cost.qty) || 1,
        rate: cost.rate,
        billable: cost.billable,
      });
      setCost({ kind: 'labour', desc: '', qty: '1', rate: '', billable: true });
      await refreshJob();
    } catch (e) {
      Alert.alert('Cost not added', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const reverseCost = async () => {
    if (!removing) return;
    if (!removeWhy.trim()) return Alert.alert('Reason needed', 'A posted cost is reversed, not deleted. Say why it is coming off.');
    setBusy('rm');
    try {
      await reverseJobCost(removing, removeWhy.trim());
      setRemoving(null);
      setRemoveWhy('');
      await refreshJob();
    } catch (e) {
      Alert.alert('Not reversed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const prepareInvoice = async () => {
    if (!job) return;
    setBusy('invoice');
    try {
      const out = await invoiceJob(job.type, job.id);
      Alert.alert(out.reused ? 'Already invoiced' : 'Invoice drafted', out.reused ? 'This job already has an invoice.' : 'Open Sales to issue it.');
      await refreshJob();
    } catch (e) {
      Alert.alert('Not invoiced', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const liveInvoice = summary?.documents.find((d) => d.doc_type === 'invoice' && d.status !== 'cancelled');
  const active = view === 'approvals' ? pending : view === 'vans' ? vans : profit;
  const t = profit.data?.totals;

  return (
    <AdminScreen
      title="Job Costing"
      subtitle="Materials, labour and margin"
      onBack={onBack}
      onRefresh={async () => {
        await Promise.all([reloadAll(), vans.reload()]);
      }}
      loading={active.loading}
      error={active.error}
      toolbar={
        <FilterChips
          activeKey={view}
          onSelect={(k) => setView(k as Mode)}
          items={[
            { key: 'approvals', label: 'To approve', count: pending.data?.length },
            { key: 'margin', label: 'Job margins', count: profit.data?.jobs.length },
            { key: 'vans', label: 'Held by technicians', count: vans.data?.vans.length },
          ]}
        />
      }
    >
      {view === 'approvals' ? (
        <>
          {(pending.data ?? []).length === 0 ? <EmptyNote text="No materials are waiting for approval" icon="check-circle" /> : null}
          {(pending.data ?? []).map((m) => (
            <ListRow
              key={m.id}
              icon="cube"
              iconColor={semantic.warning}
              title={m.employee_name || 'Technician'}
              subtitle={m.job ? `${m.job.full_name || 'Customer'} · ${m.job.ticket_no || ''}` : 'Job not found'}
              meta={`${m.line_count} lines · ${humanize(m.kind)} · ${m.location_name || 'van'} · ${timeAgo(m.submitted_at)}`}
              footer={
                <>
                  <ActionButton label="Reject" tone="danger" onPress={() => { setReason(''); setRejecting(m); }} />
                  <ActionButton label="Approve" tone="success" busy={busy === m.id} onPress={() => approve(m)} />
                </>
              }
            />
          ))}
        </>
      ) : view === 'vans' ? (
        <>
          {(vans.data?.vans ?? []).length === 0 ? <EmptyNote text="No technician vans set up yet. Create one in Stock, Locations." icon="cube" /> : null}
          {(vans.data?.vans ?? []).map((v) => (
            <View key={`${v.location_name}-${v.employee_name}`}>
              <SectionLabel>{`${v.location_name}${v.employee_name ? ` · ${v.employee_name}` : ''} — ${inr(rupees(v.value_paise))}`}</SectionLabel>
              {v.items.length === 0 ? <Text style={{ color: theme.text3 }}>Holding nothing.</Text> : null}
              {v.items.map((i) => (
                <ListRow key={i.name} icon="cube" title={i.name} subtitle={`${i.held_qty} ${i.base_unit || i.unit || ''}`} value={inr(rupees(i.value_paise))} />
              ))}
            </View>
          ))}
          {vans.data ? <Text style={{ color: theme.text3 }}>{vans.data.scope.basis}. Stock the business still owns, neither sold nor spent until used on a job.</Text> : null}
        </>
      ) : (
        <>
          {t ? (
            <StatGrid
              items={[
                { label: 'Revenue (before tax)', value: inr(rupees(t.revenue_paise)) },
                { label: 'Cost', value: inr(rupees(t.cost_paise)), color: semantic.warning },
                { label: 'Margin', value: inr(rupees(t.margin_paise)), color: t.margin_paise >= 0 ? semantic.success : semantic.danger },
                { label: `Unbilled jobs`, value: t.unbilled_jobs, color: t.unbilled_jobs ? semantic.danger : undefined },
              ]}
            />
          ) : null}
          {(profit.data?.jobs ?? []).length === 0 ? <EmptyNote text="No costed jobs in this period" icon="calculator" /> : null}
          {(profit.data?.jobs ?? []).map((j) => (
            <ListRow
              key={`${j.job_type}-${j.job_id}`}
              icon="calculator"
              iconColor={j.unbilled ? semantic.danger : j.margin_paise >= 0 ? semantic.success : semantic.danger}
              title={j.customer || 'Customer'}
              subtitle={`${j.ticket_no || ''}${j.invoice_no ? ` · ${j.invoice_no}` : ''} · ${shortDate(j.job_date)}`}
              meta={`Cost ${inr(rupees(j.total_cost_paise))}${j.unbilled ? ' · not invoiced yet' : ` · revenue ${inr(rupees(j.revenue_paise))}`}`}
              onPress={() => openJob(j.job_type, j.job_id)}
              value={j.unbilled ? '—' : inr(rupees(j.margin_paise))}
              valueColor={j.margin_paise >= 0 ? semantic.success : semantic.danger}
              badge={j.margin_pct != null ? { label: `${j.margin_pct}%`, color: j.margin_pct >= 0 ? semantic.success : semantic.danger } : undefined}
            />
          ))}
        </>
      )}

      <FormSheet
        visible={!!job}
        title={summary?.job.ticket_no || 'Job'}
        subtitle={summary ? `${summary.job.customer || '—'} · ${summary.job.type}` : undefined}
        onClose={() => setJob(null)}
        footer={summary && !liveInvoice ? <ActionButton label="Prepare invoice" busy={busy === 'invoice'} onPress={prepareInvoice} grow /> : undefined}
      >
        {summary ? (
          <View>
            <StatGrid
              items={[
                { label: 'Estimated cost', value: inr(rupees(summary.totals.estimated_cost_paise)) },
                { label: 'Materials used', value: inr(rupees(summary.totals.material_cost_paise)) },
                { label: 'Labour & travel', value: inr(rupees(summary.totals.other_cost_paise)) },
                { label: 'Invoiced', value: inr(rupees(summary.totals.revenue_paise)), color: semantic.success },
                {
                  label: `Margin${summary.totals.margin_pct != null ? ` · ${summary.totals.margin_pct}%` : ''}`,
                  value: inr(rupees(summary.totals.margin_paise)),
                  color: summary.totals.margin_paise >= 0 ? semantic.success : semantic.danger,
                },
              ]}
            />
            <SectionLabel>{`Materials${summary.totals.pending_approvals ? ` · ${summary.totals.pending_approvals} waiting` : ''}`}</SectionLabel>
            {summary.material_lines.length === 0 ? <Text style={{ color: theme.text3 }}>No materials recorded on this job yet.</Text> : null}
            {summary.material_lines.map((m, i) => (
              <ListRow
                key={i}
                icon="cube"
                title={m.item_name || m.description || 'Item'}
                subtitle={`${Number(m.base_quantity)}${m.kind === 'returned' ? ' · returned' : ''}`}
                value={inr(rupees(m.cost_paise))}
                badge={{ label: m.status, color: m.status === 'approved' ? semantic.success : m.status === 'rejected' ? semantic.danger : semantic.warning }}
              />
            ))}
            {summary.costs.length ? <SectionLabel>Labour, travel and other</SectionLabel> : null}
            {summary.costs.map((c) => (
              <ListRow
                key={c.id}
                icon="calculator"
                title={c.description || humanize(c.kind)}
                subtitle={`${Number(c.quantity)} × ${inr(rupees(c.rate_paise))} · ${c.basis}${c.billable ? '' : ' · not billed on'}`}
                value={inr(rupees(c.amount_paise))}
                footer={<ActionButton label="Remove" tone="neutral" onPress={() => { setRemoveWhy(''); setRemoving(c.id); }} />}
              />
            ))}
            <SectionLabel>Add a cost</SectionLabel>
            <FilterChips items={COST_KINDS} activeKey={cost.kind} onSelect={(k) => setCost({ ...cost, kind: k })} />
            <Field label="Note" value={cost.desc} onChangeText={(v) => setCost({ ...cost, desc: v })} placeholder="e.g. 3 hours on site" />
            <Field label="Quantity" value={cost.qty} onChangeText={(v) => setCost({ ...cost, qty: v })} keyboardType="decimal-pad" />
            <Field label="Rate ₹" value={cost.rate} onChangeText={(v) => setCost({ ...cost, rate: v })} keyboardType="decimal-pad" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }}>
              <Switch value={cost.billable} onValueChange={(v) => setCost({ ...cost, billable: v })} trackColor={{ true: brand.primary }} />
              <Text style={{ color: theme.text, flex: 1 }}>Charge to the customer</Text>
            </View>
            <ActionButton label="Add cost" busy={busy === 'cost'} onPress={addCost} />
            {liveInvoice ? <Text style={{ color: theme.text3, marginTop: 8 }}>Invoice {liveInvoice.doc_no || 'draft'} · {liveInvoice.status}</Text> : null}
            <Text style={{ color: theme.text3, marginTop: 8 }}>{summary.basis}</Text>
          </View>
        ) : null}
      </FormSheet>

      <FormSheet
        visible={!!removing}
        title="Reverse this cost"
        onClose={() => setRemoving(null)}
        footer={<ActionButton label="Reverse cost" tone="danger" busy={busy === 'rm'} onPress={reverseCost} grow />}
      >
        <Field label="Why is it coming off?" value={removeWhy} onChangeText={setRemoveWhy} multiline hint="A posted cost is reversed, not deleted" />
      </FormSheet>

      <FormSheet
        visible={!!rejecting}
        title="Reject materials"
        subtitle={rejecting?.employee_name || undefined}
        onClose={() => setRejecting(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setRejecting(null)} />
            <ActionButton label="Reject" tone="danger" onPress={reject} busy={busy === rejecting?.id} />
          </>
        }
      >
        <Field label="Reason" value={reason} onChangeText={setReason} multiline hint="The technician sees this" />
      </FormSheet>
    </AdminScreen>
  );
}
