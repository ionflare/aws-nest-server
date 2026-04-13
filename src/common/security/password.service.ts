import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordService {
  async hash(plainText: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(plainText, salt, 64)) as Buffer;
    return `scrypt$${salt}$${derivedKey.toString('hex')}`;
  }

  async verify(plainText: string, storedHash: string): Promise<boolean> {
    const [algorithm, salt, hashHex] = storedHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !hashHex) {
      return false;
    }

    const derivedKey = (await scrypt(plainText, salt, 64)) as Buffer;
    const hashBuffer = Buffer.from(hashHex, 'hex');

    if (derivedKey.length !== hashBuffer.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, hashBuffer);
  }
}
