import { normalizeEventUrl } from './page'

describe('normalizeEventUrl', () => {
  it('removes query and hash while preserving pathname and trailing slash', () => {
    expect(
      normalizeEventUrl('https://example.com/account/?user=123#settings')
    ).toBe('https://example.com/account/')
  })

  it('collapses user-specific URL variants', () => {
    expect(normalizeEventUrl('https://example.com/users/alice?tab=posts')).toBe(
      normalizeEventUrl('https://example.com/users/alice?tab=activity')
    )
  })
})
