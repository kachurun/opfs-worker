import { describe, it, expect } from 'vitest';
import { encodeString, decodeBuffer, isBinaryFileExtension } from '../src/utils/encoder';

describe('Encoder Utilities', () => {
  describe('encodeString', () => {
    it('encodes UTF-8 strings correctly', () => {
      const input = 'Hello, World!';
      const encoded = encodeString(input, 'utf-8');
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(encoded)).toBe(input);
    });

    it('encodes UTF-16LE strings correctly', () => {
      const input = 'Hello, World!';
      const encoded = encodeString(input, 'utf-16le');
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(input.length * 2);
      
      // Verify it can be decoded back
      const decoded = decodeBuffer(encoded, 'utf-16le');
      expect(decoded).toBe(input);
    });

    it('encodes ASCII strings correctly', () => {
      const input = 'Hello';
      const encoded = encodeString(input, 'ascii');
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(input.length);
      
      // Verify it can be decoded back
      const decoded = decodeBuffer(encoded, 'ascii');
      expect(decoded).toBe(input);
    });

    it('encodes Latin1 strings correctly', () => {
      const input = 'Hello, World!';
      const encoded = encodeString(input, 'latin1');
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(input.length);
      
      // Verify it can be decoded back
      const decoded = decodeBuffer(encoded, 'latin1');
      expect(decoded).toBe(input);
    });

    it('encodes base64 strings correctly', () => {
      const input = 'SGVsbG8sIFdvcmxkIQ=='; // "Hello, World!" in base64
      const encoded = encodeString(input, 'base64');
      expect(encoded).toBeInstanceOf(Uint8Array);
      
      // Verify it can be decoded back
      const decoded = decodeBuffer(encoded, 'base64');
      expect(decoded).toBe(input);
    });

    it('encodes hex strings correctly', () => {
      const input = '48656c6c6f2c20576f726c6421'; // "Hello, World!" in hex
      const encoded = encodeString(input, 'hex');
      expect(encoded).toBeInstanceOf(Uint8Array);
      
      // Verify it can be decoded back
      const decoded = decodeBuffer(encoded, 'hex');
      expect(decoded).toBe(input);
    });

    it('falls back to UTF-8 for unsupported encodings', () => {
      const input = 'Hello, World!';
      const encoded = encodeString(input, 'unsupported' as any);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(encoded)).toBe(input);
    });
  });

  describe('decodeBuffer', () => {
    it('decodes UTF-8 buffers correctly', () => {
      const input = 'Hello, World!';
      const buffer = new TextEncoder().encode(input);
      const decoded = decodeBuffer(buffer, 'utf-8');
      expect(decoded).toBe(input);
    });

    it('decodes UTF-16LE buffers correctly', () => {
      const input = 'Hello, World!';
      const buffer = encodeString(input, 'utf-16le');
      const decoded = decodeBuffer(buffer, 'utf-16le');
      expect(decoded).toBe(input);
    });

    it('decodes ASCII buffers correctly', () => {
      const input = 'Hello';
      const buffer = encodeString(input, 'ascii');
      const decoded = decodeBuffer(buffer, 'ascii');
      expect(decoded).toBe(input);
    });

    it('decodes Latin1 buffers correctly', () => {
      const input = 'Hello, World!';
      const buffer = encodeString(input, 'latin1');
      const decoded = decodeBuffer(buffer, 'latin1');
      expect(decoded).toBe(input);
    });

    it('decodes base64 buffers correctly', () => {
      const input = 'Hello, World!';
      const buffer = new TextEncoder().encode(input);
      const base64 = btoa(input);
      const decoded = decodeBuffer(buffer, 'base64');
      expect(decoded).toBe(base64);
    });

    it('decodes hex buffers correctly', () => {
      const input = 'Hello, World!';
      const buffer = new TextEncoder().encode(input);
      const hex = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
      const decoded = decodeBuffer(buffer, 'hex');
      expect(decoded).toBe(hex);
    });

    it('falls back to UTF-8 for unsupported encodings', () => {
      const input = 'Hello, World!';
      const buffer = new TextEncoder().encode(input);
      const decoded = decodeBuffer(buffer, 'unsupported' as any);
      expect(decoded).toBe(input);
    });
  });

  describe('isBinaryFileExtension', () => {
    it('identifies binary file extensions correctly', () => {
      expect(isBinaryFileExtension('/path/to/image.jpg')).toBe(true);
      expect(isBinaryFileExtension('/path/to/image.png')).toBe(true);
      expect(isBinaryFileExtension('/path/to/document.pdf')).toBe(true);
      expect(isBinaryFileExtension('/path/to/archive.zip')).toBe(true);
      expect(isBinaryFileExtension('/path/to/executable.exe')).toBe(true);
      expect(isBinaryFileExtension('/path/to/data.bin')).toBe(true);
    });

    it('identifies text file extensions correctly', () => {
      expect(isBinaryFileExtension('/path/to/document.txt')).toBe(false);
      expect(isBinaryFileExtension('/path/to/script.js')).toBe(false);
      expect(isBinaryFileExtension('/path/to/style.css')).toBe(false);
      expect(isBinaryFileExtension('/path/to/markdown.md')).toBe(false);
      expect(isBinaryFileExtension('/path/to/config.json')).toBe(false);
      expect(isBinaryFileExtension('/path/to/data.csv')).toBe(false);
    });

    it('handles files without extensions', () => {
      expect(isBinaryFileExtension('/path/to/file')).toBe(true);
      expect(isBinaryFileExtension('README')).toBe(true);
      expect(isBinaryFileExtension('Dockerfile')).toBe(true);
    });

    it('handles files with dots in names', () => {
      expect(isBinaryFileExtension('/path/to/file.name.txt')).toBe(false);
      expect(isBinaryFileExtension('/path/to/config.local.json')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(isBinaryFileExtension('/path/to/image.JPG')).toBe(true);
      expect(isBinaryFileExtension('/path/to/image.PNG')).toBe(true);
      expect(isBinaryFileExtension('/path/to/document.TXT')).toBe(false);
    });
  });

  describe('round-trip encoding/decoding', () => {
    it('preserves data through encode/decode cycle for UTF-8', () => {
      const input = 'Hello, World! 🌍';
      const encoded = encodeString(input, 'utf-8');
      const decoded = decodeBuffer(encoded, 'utf-8');
      expect(decoded).toBe(input);
    });

    it('preserves data through encode/decode cycle for UTF-16LE', () => {
      const input = 'Hello, World! 🌍';
      const encoded = encodeString(input, 'utf-16le');
      const decoded = decodeBuffer(encoded, 'utf-16le');
      expect(decoded).toBe(input);
    });

    it('preserves data through encode/decode cycle for ASCII', () => {
      const input = 'Hello, World!';
      const encoded = encodeString(input, 'ascii');
      const decoded = decodeBuffer(encoded, 'ascii');
      expect(decoded).toBe(input);
    });

    it('preserves data through encode/decode cycle for Latin1', () => {
      const input = 'Hello, World!';
      const encoded = encodeString(input, 'latin1');
      const decoded = decodeBuffer(encoded, 'latin1');
      expect(decoded).toBe(input);
    });
  });
});
