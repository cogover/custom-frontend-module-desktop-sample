import { describe, expect, it } from 'vitest';
import { mockStatusRule } from '../../dev/mock-seed';
import { canMove, createChoices, moveRefused, parseStatusFlow, statusChoices, transitionError } from './statusFlow';

const FIELD = 'OFDEMOTASKSTA';

describe('status workflow (transition rule on field status)', () => {
  it('reads the Workspace rule: creation from _initial, next steps per status, in the list order', () => {
    const flow = parseStatusFlow([mockStatusRule()], FIELD)!;
    expect(flow.initial).toEqual(['new']);
    expect(flow.next).toEqual({
      new: ['in_progress', 'cancelled'],
      in_progress: ['pending', 'on_hold', 'resolved'],
      pending: ['in_progress', 'resolved', 'cancelled'],
      on_hold: ['in_progress', 'cancelled'],
      resolved: ['closed'],
    });
  });

  it('ignores inactive rules, other fields, rules limited to some records; adds up several rules', () => {
    const rule = mockStatusRule();
    expect(parseStatusFlow([{ ...rule, status: 0 }], FIELD)).toBeNull();
    expect(parseStatusFlow([{ ...rule, objectFieldId: 'OFOTHER' }], FIELD)).toBeNull();
    expect(parseStatusFlow([{ ...rule, shouldFilterRecord: true }], FIELD)).toBeNull();
    expect(parseStatusFlow([], FIELD)).toBeNull();
    expect(parseStatusFlow(null, FIELD)).toBeNull();
    const extra = { ...rule, id: 'TR2', flows: [{ originValue: 'closed', targetValue: 'new' }, { originValue: 'x', targetValue: '_initial' }, {}] };
    const flow = parseStatusFlow([rule, extra], FIELD)!;
    expect(flow.next.closed).toEqual(['new']);
    expect(flow.next.x).toBeUndefined();
    expect(parseStatusFlow({ ...rule }, FIELD)?.initial).toEqual(['new']); // a single object is accepted
  });

  it('allows staying and the listed steps only; no rule allows everything', () => {
    const flow = parseStatusFlow([mockStatusRule()], FIELD);
    expect(canMove(flow, 'new', 'in_progress')).toBe(true);
    expect(canMove(flow, 'new', 'resolved')).toBe(false);
    expect(canMove(flow, 'resolved', 'in_progress')).toBe(false); // undo is not a way back
    expect(canMove(flow, 'closed', 'closed')).toBe(true);
    expect(canMove(null, 'closed', 'new')).toBe(true);
    expect(statusChoices(flow, 'in_progress')).toEqual(['in_progress', 'pending', 'on_hold', 'resolved']);
    expect(statusChoices(flow, 'closed')).toEqual(['closed']);
    expect(statusChoices(null, 'new')).toHaveLength(7);
    expect(createChoices(flow)).toEqual(['new']);
    expect(createChoices(null)).toHaveLength(7);
  });

  it('puts the server’s refusals in Vietnamese', () => {
    expect(moveRefused('new', 'resolved')).toBe('Quy trình không cho chuyển từ “Mới” sang “Đã xử lý”');
    expect(transitionError('Your target value [pending] is not allowed, current value: [new], available values: [new, in_progress, cancelled]')).toBe(
      'Quy trình không cho chuyển từ “Mới” sang “Đang chờ”',
    );
    expect(transitionError('Value: [in_progress] is not in transition rule')).toBe('Quy trình không cho phép trạng thái “Đang xử lý” ở bước này');
    expect(transitionError('Lỗi khác')).toBeNull();
  });
});
