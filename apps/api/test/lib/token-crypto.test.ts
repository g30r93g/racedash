import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Set env before importing
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes in hex

import { encryptToken, decryptToken } from '../../src/lib/token-crypto'

describe('token-crypto', () => {
  it('encryptToken produces different ciphertext for same input (random IV)', () => {
    const plaintext = 'ya29.test-access-token'
    const a = encryptToken(plaintext)
    const b = encryptToken(plaintext)
    expect(a).not.toBe(b)
  })

  it('decryptToken recovers original plaintext', () => {
    const plaintext = 'ya29.test-access-token-12345'
    const encrypted = encryptToken(plaintext)
    expect(decryptToken(encrypted)).toBe(plaintext)
  })

  it('decryptToken throws on tampered ciphertext', () => {
    const encrypted = encryptToken('secret')
    const parts = encrypted.split(':')
    // Tamper with ciphertext
    parts[2] = 'ff' + parts[2].slice(2)
    expect(() => decryptToken(parts.join(':'))).toThrow()
  })

  it('decryptToken throws on wrong key', () => {
    const encrypted = encryptToken('secret')
    // Change the key
    process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64)
    expect(() => decryptToken(encrypted)).toThrow()
    // Restore
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
  })

  it('encrypted format matches iv:authTag:ciphertext hex pattern', () => {
    const encrypted = encryptToken('test')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/)
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/)
    // Ciphertext is variable length hex
    expect(parts[2]).toMatch(/^[0-9a-f]+$/)
  })

  it('round-trip: encryptToken then decryptToken returns original string', () => {
    const inputs = ['', 'short', 'a'.repeat(1000), 'special chars: ñ 你好 🎯']
    for (const input of inputs) {
      expect(decryptToken(encryptToken(input))).toBe(input)
    }
  })
})
