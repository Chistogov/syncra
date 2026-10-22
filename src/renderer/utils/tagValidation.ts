/**
 * AWS S3 & MinIO Object Tagging Validation
 * According to official S3 specification:
 * - Allowed characters: [a-zA-Z0-9 +=\._:/\-]
 * - Key length: 1 to 128 characters
 * - Value length: 0 to 256 characters
 * - Cyrillic is NOT supported by S3 tag headers / XML specifications
 */

export interface TagValidationResult {
  isValid: boolean;
  error?: string;
}

export const S3_TAG_ALLOWED_REGEX = /^[a-zA-Z0-9 +=\._:/\-]+$/;

export function validateS3TagKey(key: string): TagValidationResult {
  const trimmed = key.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Ключ тега не может быть пустым' };
  }
  if (trimmed.length > 128) {
    return { isValid: false, error: 'Длина ключа тега не должна превышать 128 символов' };
  }
  if (/[а-яА-ЯёЁ]/i.test(trimmed)) {
    return {
      isValid: false,
      error: 'Кириллица не поддерживается в тегах S3. Используйте только латиницу (a-z, A-Z)',
    };
  }
  if (!S3_TAG_ALLOWED_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: 'Недопустимые символы. Разрешены только латинские буквы, цифры и знаки: + - = . _ : / пробел',
    };
  }
  return { isValid: true };
}

export function validateS3TagValue(value: string): TagValidationResult {
  const trimmed = value.trim();
  if (trimmed.length > 256) {
    return { isValid: false, error: 'Длина значения тега не должна превышать 256 символов' };
  }
  if (trimmed.length > 0) {
    if (/[а-яА-ЯёЁ]/i.test(trimmed)) {
      return {
        isValid: false,
        error: 'Кириллица не поддерживается в тегах S3. Используйте только латиницу',
      };
    }
    if (!S3_TAG_ALLOWED_REGEX.test(trimmed)) {
      return {
        isValid: false,
        error: 'Недопустимые символы в значении. Разрешены только латиница, цифры и знаки: + - = . _ : / пробел',
      };
    }
  }
  return { isValid: true };
}
