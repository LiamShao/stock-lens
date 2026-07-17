import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes passwords with Argon2id and verifies the result', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      hasher.verify(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong password')).resolves.toBe(false);
  });
});
