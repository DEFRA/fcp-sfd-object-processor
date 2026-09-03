import { describe, it, expect } from 'vitest'
import { ttlSeconds } from '../../../../src/config/formats/ttl-seconds.js'

describe('ttlSeconds format', () => {
    it('accepts an integer at the minimum bound', () => {
        expect(() => ttlSeconds.validate(60)).not.toThrow()
    })

    it('accepts an integer above the minimum bound', () => {
        expect(() => ttlSeconds.validate(604800)).not.toThrow()
    })

    it('rejects a value below the minimum bound', () => {
        expect(() => ttlSeconds.validate(59)).toThrow('must be an integer of at least 60 seconds')
    })

    it('rejects zero', () => {
        expect(() => ttlSeconds.validate(0)).toThrow('must be an integer of at least 60 seconds')
    })

    it('rejects a negative value', () => {
        expect(() => ttlSeconds.validate(-1)).toThrow('must be an integer of at least 60 seconds')
    })

    it('rejects a non-integer number', () => {
        expect(() => ttlSeconds.validate(60.5)).toThrow('must be an integer of at least 60 seconds')
    })
})
