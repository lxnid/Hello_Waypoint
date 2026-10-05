import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ClipboardCheck, TriangleAlert } from 'lucide-react';
import { request } from '../../api';
import type { Attempt, Detail, ReceiptCounts } from '../../types/store-workspace';
import { panel, field, button, json } from './store-ui';
export function Receipt({
  attempt,
  data,
  refresh,
}: {
  attempt: Attempt;
  data: Detail;
  refresh: () => void;
}) {
  const [temperature, setTemperature] = useState('');
  const [verified, setVerified] = useState(false);
  const [outcome, setOutcome] = useState(attempt.outcome ?? 'DELIVERED');
  const [counts, setCounts] = useState<Record<string, ReceiptCounts>>({});
  const rows = data.aggregate
    ? [{ id: 'aggregate', name: 'Aggregate consignment', quantity: attempt.delivered_units ?? 0 }]
    : data.lines.map((line) => ({
        id: line.id,
        name: line.name,
        quantity:
          attempt.lines?.find((record) => record.order_line_id === line.id)?.delivered_quantity ??
          0,
      }));
  const actual = (row: (typeof rows)[number]) =>
    counts[row.id] ?? { accepted: row.quantity, missing: 0, damaged: 0, rejected: 0 };
  const balanced = rows.every(
    (row) =>
      Object.values(actual(row)).every((value) => Number.isInteger(value) && value >= 0) &&
      Object.values(actual(row)).reduce((sum, value) => sum + value, 0) === row.quantity,
  );
  const receipt = useMutation({
    mutationFn: () =>
      request(
        `/attempts/${attempt.id}/receipt`,
        json({
          outcome,
          ...(temperature ? { temperatureC: temperature } : {}),
          ...(data.aggregate
            ? {
                aggregate: {
                  acceptedUnits: actual(rows[0]!).accepted,
                  missingUnits: actual(rows[0]!).missing,
                  damagedUnits: actual(rows[0]!).damaged,
                  rejectedUnits: actual(rows[0]!).rejected,
                },
              }
            : {
                lines: rows.map((row) => ({
                  orderLineId: row.id,
                  acceptedQuantity: actual(row).accepted,
                  missingQuantity: actual(row).missing,
                  damagedQuantity: actual(row).damaged,
                  rejectedQuantity: actual(row).rejected,
                })),
              }),
        }),
      ),
    onSuccess: refresh,
  });
  return (
    <section className={`${panel} space-y-4`}>
      <h2 className="flex items-center gap-2 font-semibold">
        <ClipboardCheck size={20} />
        Goods receipt · {attempt.outcome}
      </h2>
      {attempt.receipt ? (
        <p className="text-sm">Receipt confirmed.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Account for the quantities reported delivered. Any missing, damaged or rejected units
            must be included in the total.
          </p>
          {rows.map((row) => (
            <div key={row.id} className="rounded-control border border-border p-4">
              <p className="mb-3 text-sm font-medium">
                {row.name} · {row.quantity} reported delivered
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['accepted', 'missing', 'damaged', 'rejected'] as const).map((key) => (
                  <label className="text-xs capitalize" key={key}>
                    {key}
                    <input
                      className={field}
                      type="number"
                      min="0"
                      max={row.quantity}
                      step="1"
                      value={actual(row)[key]}
                      onChange={(event) => {
                        setVerified(false);
                        setCounts({
                          ...counts,
                          [row.id]: { ...actual(row), [key]: Number(event.target.value) },
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="block text-sm">
            Receipt outcome
            <select
              className={field}
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              {['DELIVERED', 'PARTIAL', 'REJECTED', 'FAILED'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {data.order.temperature_requirement === 'chilled' && (
            <label className="block text-sm">
              Measured receipt temperature (°C)
              <input
                className={field}
                type="number"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
              />
            </label>
          )}
          {!balanced && (
            <p className="text-sm text-amber-800">
              The four quantities must total the reported delivered quantity for every item.
            </p>
          )}
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
            />
            I checked the goods against these quantities.
          </label>
          {receipt.error && (
            <p role="alert" className="text-sm text-red-800">
              {receipt.error.message}
            </p>
          )}
          <button
            className={button}
            disabled={
              receipt.isPending ||
              !verified ||
              !balanced ||
              (data.order.temperature_requirement === 'chilled' && !temperature)
            }
            onClick={() => receipt.mutate()}
          >
            Confirm receipt
          </button>
        </>
      )}
    </section>
  );
}

export function IssueReport({ data, refresh }: { data: Detail; refresh: () => void }) {
  const [stopId, setStopId] = useState(data.stops[0]?.id ?? '');
  const [type, setType] = useState('DAMAGED');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const issue = useMutation({
    mutationFn: () =>
      request(
        '/issues',
        json({ stopId, stage: 'RECEIPT', type, affectedQuantity: quantity, notes }),
      ),
    onSuccess: () => {
      setNotes('');
      refresh();
    },
  });
  return (
    <details className={panel}>
      <summary className="cursor-pointer font-semibold">
        <TriangleAlert size={18} className="mr-2 inline" />
        Report a receipt issue
      </summary>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          issue.mutate();
        }}
      >
        <label className="block text-sm">
          Delivery stop
          <select
            className={field}
            value={stopId}
            onChange={(event) => setStopId(event.target.value)}
          >
            {data.stops.map((stop, index) => (
              <option key={stop.id} value={stop.id}>
                Stop {index + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Issue type
          <select className={field} value={type} onChange={(event) => setType(event.target.value)}>
            {['DAMAGED', 'MISSING', 'TEMPERATURE', 'REJECTED'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Affected units
          <input
            type="number"
            min="1"
            step="1"
            required
            className={field}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </label>
        <label className="block text-sm">
          Details
          <textarea
            className={`${field} p-4`}
            required
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {issue.error && (
          <p role="alert" className="text-sm text-red-800">
            {issue.error.message}
          </p>
        )}
        {issue.isSuccess && (
          <p role="status" className="text-sm">
            Issue recorded.
          </p>
        )}
        <button className={button} disabled={issue.isPending}>
          Report issue
        </button>
      </form>
    </details>
  );
}
