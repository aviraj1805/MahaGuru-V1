import { describe, expect, it } from 'vitest';
import { SITE_TITLE, titleForPath } from './title';

describe('titleForPath', () => {
  it('gives each page its own tab title', () => {
    expect(titleForPath('/')).toBe(SITE_TITLE);
    expect(titleForPath('/reflect')).toBe('StudentGPT · MahaGuru AI');
    expect(titleForPath('/reflect/5f89bb9d')).toBe('StudentGPT · MahaGuru AI');
    expect(titleForPath('/learn')).toBe('Classroom · MahaGuru AI');
    expect(titleForPath('/learn/new')).toBe('New classroom · MahaGuru AI');
    expect(titleForPath('/learn/abc/lesson/def')).toBe('Lesson · MahaGuru AI');
    expect(titleForPath('/safety')).toBe('Safety and support · MahaGuru AI');
  });

  it('names unknown pages as not found', () => {
    expect(titleForPath('/no-such-page')).toBe('Page not found · MahaGuru AI');
  });
});
