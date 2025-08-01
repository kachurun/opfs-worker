import { OPFSError } from './errors';

import type { BufferEncoding } from 'typescript';

export function encodeString(data: string, encoding: BufferEncoding = 'utf-8'): Uint8Array {
    switch (encoding) {
        case 'utf8':
        case 'utf-8':
            return new TextEncoder().encode(data);

        case 'utf16le':
        case 'ucs2':
        case 'ucs-2':
            return encodeUtf16LE(data);

        case 'ascii':
            return encodeAscii(data);

        case 'latin1':
            return encodeLatin1(data);

        case 'binary':
            // For binary encoding, treat the string as raw bytes
            // This assumes the string contains raw byte values
            return Uint8Array.from(data, char => char.charCodeAt(0));

        case 'base64':
            return Uint8Array.from(atob(data), c => c.charCodeAt(0));

        case 'hex':
            if (!/^[\da-f]+$/i.test(data) || data.length % 2 !== 0) {
                throw new OPFSError('Invalid hex string', 'INVALID_HEX_FORMAT');
            }

            return Uint8Array.from(data.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

        default:
            console.warn('Encoding not supported, falling back to UTF-8');

            return new TextEncoder().encode(data);
    }
}

export function decodeBuffer(buffer: Uint8Array, encoding: BufferEncoding = 'utf-8'): string {
    switch (encoding) {
        case 'utf8':
        case 'utf-8':
            return new TextDecoder().decode(buffer);

        case 'utf16le':
        case 'ucs2':
        case 'ucs-2':
            return decodeUtf16LE(buffer);

        case 'latin1':
            return String.fromCharCode(...buffer);

        case 'binary':
            // For binary encoding, return raw byte values as string
            return String.fromCharCode(...buffer);

        case 'ascii':
            return String.fromCharCode(...buffer.map(b => b & 0x7F));

        case 'base64':
            return btoa(String.fromCharCode(...buffer));

        case 'hex':
            return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');

        default:
            console.warn('Unsupported encoding, falling back to UTF-8');

            return new TextDecoder().decode(buffer);
    }
}

function encodeUtf16LE(str: string): Uint8Array {
    const buf = new Uint8Array(str.length * 2);

    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);

        buf[(i * 2)] = code & 0xFF;
        buf[(i * 2) + 1] = code >> 8;
    }

    return buf;
}

function decodeUtf16LE(buf: Uint8Array): string {
    if (buf.length % 2 !== 0) {
        console.warn('Invalid UTF-16LE buffer length, truncating last byte');
        buf = buf.slice(0, buf.length - 1);
    }

    const codeUnits = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);

    return String.fromCharCode(...codeUnits);
}

function encodeLatin1(str: string): Uint8Array {
    const buf = new Uint8Array(str.length);

    for (let i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i) & 0xFF;
    }

    return buf;
}

function encodeAscii(str: string): Uint8Array {
    const buf = new Uint8Array(str.length);

    for (let i = 0; i < str.length; i++) {
        buf[i] = str.charCodeAt(i) & 0x7F;
    }

    return buf;
}
