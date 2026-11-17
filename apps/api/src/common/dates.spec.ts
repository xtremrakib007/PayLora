import { lateMinutes, roundUpMinutes } from './dates';

describe('lateMinutes', () => {
  it('ignores lateness inside the grace period', () => {
    expect(lateMinutes('09:08', '09:00', 10)).toBe(0);
    expect(lateMinutes('09:10', '09:00', 10)).toBe(0);
  });
  it('counts all minutes after start once grace is exceeded', () => {
    expect(lateMinutes('09:11', '09:00', 10)).toBe(11);
    expect(lateMinutes('10:30', '09:00', 0)).toBe(90);
  });
  it('treats early arrival as on time, including overnight shifts', () => {
    expect(lateMinutes('08:45', '09:00', 0)).toBe(0);
    expect(lateMinutes('22:50', '23:00', 0)).toBe(0);
    expect(lateMinutes('23:20', '23:00', 5)).toBe(20);
    expect(lateMinutes('00:15', '23:00', 5)).toBe(75);
  });
});

describe('roundUpMinutes', () => {
  it('rounds up to the block', () => {
    expect(roundUpMinutes(11, 15)).toBe(15);
    expect(roundUpMinutes(16, 15)).toBe(30);
    expect(roundUpMinutes(11, 1)).toBe(11);
    expect(roundUpMinutes(0, 30)).toBe(0);
  });
});
