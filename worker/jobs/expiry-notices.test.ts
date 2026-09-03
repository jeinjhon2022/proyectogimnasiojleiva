import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';

const findCandidatesMock = vi.fn();
const markSentMock = vi.fn();
const findExpiredCandidatesMock = vi.fn();
const markExpiredSentMock = vi.fn();
vi.mock('../memberships-repo', () => ({
  findMembershipsNeedingExpiryNotice: (...args: unknown[]) => findCandidatesMock(...args),
  markExpiryNoticeSent: (...args: unknown[]) => markSentMock(...args),
  findRecentlyExpiredMemberships: (...args: unknown[]) => findExpiredCandidatesMock(...args),
  markExpiredNoticeSent: (...args: unknown[]) => markExpiredSentMock(...args),
}));

vi.mock('../gym-settings-repo', () => ({
  getGymTimezone: vi.fn().mockResolvedValue('America/Bogota'),
  todayInTimezone: vi.fn().mockReturnValue('2026-09-02'),
}));

const {
  runExpiryNoticeJob,
  runExpiredNoticeJob,
  buildExpiryNoticeEmail,
  EXPIRY_NOTICE_WINDOW_DAYS,
  EXPIRED_NOTICE_LOOKBACK_DAYS,
} = await import('./expiry-notices');

const fakeEnv = { RESEND_API_KEY: 'test-key' } as Env;

beforeEach(() => {
  findCandidatesMock.mockReset();
  markSentMock.mockReset();
  findExpiredCandidatesMock.mockReset();
  markExpiredSentMock.mockReset();
});

describe('buildExpiryNoticeEmail', () => {
  it('incluye el nombre, el plan y la fecha de vencimiento', () => {
    const { subject, html } = buildExpiryNoticeEmail('Ana Pérez', 'Mensual', '2026-09-14');
    expect(subject.length).toBeGreaterThan(0);
    expect(html).toContain('Ana Pérez');
    expect(html).toContain('Mensual');
    expect(html).toContain('2026-09-14');
  });
});

describe('runExpiryNoticeJob', () => {
  it('no hace nada si no hay candidatos', async () => {
    findCandidatesMock.mockResolvedValue([]);
    const sendEmail = vi.fn();

    const result = await runExpiryNoticeJob(fakeEnv, sendEmail);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('envía el correo y marca expiry_notice_sent_at para cada candidato', async () => {
    findCandidatesMock.mockResolvedValue([
      {
        membershipId: 'm1',
        memberEmail: 'a@test.dev',
        memberFullName: 'Ana',
        endDate: '2026-09-05',
        planName: 'Mensual',
      },
      {
        membershipId: 'm2',
        memberEmail: 'b@test.dev',
        memberFullName: 'Bruno',
        endDate: '2026-09-04',
        planName: 'Mensual',
      },
    ]);
    const sendEmail = vi.fn().mockResolvedValue(undefined);

    const result = await runExpiryNoticeJob(fakeEnv, sendEmail);

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(markSentMock).toHaveBeenCalledTimes(2);
  });

  it('un fallo de envío individual no detiene el resto del lote, y no marca ese como enviado', async () => {
    findCandidatesMock.mockResolvedValue([
      {
        membershipId: 'm1',
        memberEmail: 'a@test.dev',
        memberFullName: 'Ana',
        endDate: '2026-09-05',
        planName: 'Mensual',
      },
      {
        membershipId: 'm2',
        memberEmail: 'b@test.dev',
        memberFullName: 'Bruno',
        endDate: '2026-09-04',
        planName: 'Mensual',
      },
    ]);
    const sendEmail = vi
      .fn()
      .mockRejectedValueOnce(new Error('falló Resend'))
      .mockResolvedValueOnce(undefined);

    const result = await runExpiryNoticeJob(fakeEnv, sendEmail);

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(markSentMock).toHaveBeenCalledTimes(1);
    expect(markSentMock).toHaveBeenCalledWith(fakeEnv.DB, 'm2', expect.any(String));
  });

  it('usa la ventana de aviso configurada al pedir candidatos', async () => {
    findCandidatesMock.mockResolvedValue([]);
    await runExpiryNoticeJob(fakeEnv, vi.fn());
    expect(findCandidatesMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      '2026-09-02',
      EXPIRY_NOTICE_WINDOW_DAYS,
    );
  });
});

describe('runExpiredNoticeJob', () => {
  it('no hace nada si no hay candidatos', async () => {
    findExpiredCandidatesMock.mockResolvedValue([]);
    const sendEmail = vi.fn();

    const result = await runExpiredNoticeJob(fakeEnv, sendEmail);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('envía el correo y marca expired_notice_sent_at para cada candidato', async () => {
    findExpiredCandidatesMock.mockResolvedValue([
      {
        membershipId: 'm1',
        memberEmail: 'a@test.dev',
        memberFullName: 'Ana',
        endDate: '2026-08-30',
        planName: 'Mensual',
      },
    ]);
    const sendEmail = vi.fn().mockResolvedValue(undefined);

    const result = await runExpiredNoticeJob(fakeEnv, sendEmail);

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(markExpiredSentMock).toHaveBeenCalledWith(fakeEnv.DB, 'm1', expect.any(String));
  });

  it('un fallo de envío no detiene el resto ni marca ese candidato', async () => {
    findExpiredCandidatesMock.mockResolvedValue([
      {
        membershipId: 'm1',
        memberEmail: 'a@test.dev',
        memberFullName: 'Ana',
        endDate: '2026-08-30',
        planName: 'Mensual',
      },
    ]);
    const sendEmail = vi.fn().mockRejectedValue(new Error('falló Resend'));

    const result = await runExpiredNoticeJob(fakeEnv, sendEmail);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(markExpiredSentMock).not.toHaveBeenCalled();
  });

  it('usa la ventana de retroceso configurada al pedir candidatos', async () => {
    findExpiredCandidatesMock.mockResolvedValue([]);
    await runExpiredNoticeJob(fakeEnv, vi.fn());
    expect(findExpiredCandidatesMock).toHaveBeenCalledWith(
      fakeEnv.DB,
      '2026-09-02',
      EXPIRED_NOTICE_LOOKBACK_DAYS,
    );
  });
});
