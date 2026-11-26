/**
 * Password rules (PRD AU-3): at least 8 characters and not one of the passwords everybody tries
 * first. The list is a compact set of the most common ones (shared by server and client forms);
 * length and the "same as email/username" checks cover most of the rest.
 */
export const MIN_PASSWORD_LENGTH = 8;

const COMMON = `123456 password 12345678 qwerty 123456789 12345 1234 111111 1234567 dragon 123123 baseball abc123 football
monkey letmein 696969 shadow master 666666 qwertyuiop 123321 mustang 1234567890 michael 654321 superman 1qaz2wsx 7777777
121212 000000 qazwsx 123qwe killer trustno1 jordan jennifer zxcvbnm asdfgh hunter buster soccer harley batman andrew tigger
sunshine iloveyou 2000 charlie robert thomas hockey ranger daniel starwars klaster 112233 george computer michelle jessica
pepper 1111 zxcvbn 555555 11111111 131313 freedom 777777 pass maggie 159753 aaaaaa ginger princess joshua cheese amanda
summer love ashley nicole chelsea biteme matthew access yankees 987654321 dallas austin thunder taylor matrix mobilemail
mom monitor monitoring montana moon moscow password1 password123 password12 passw0rd p@ssw0rd p@ssword welcome welcome1
admin admin123 administrator login qwerty123 qwerty1 1q2w3e4r 1q2w3e 123456a a123456 abcd1234 abcdefg abcdefgh 00000000
11223344 12341234 123123123 iloveyou1 letmein1 football1 baseball1 sunshine1 princess1 whatever trustno1 starwars1
changeme secret test1234 testtest guest qwertyui asdfghjkl zaq12wsx 1234qwer 87654321 9876543210 password!`
  .split(/\s+/)
  .filter(Boolean);

const COMMON_PASSWORDS: ReadonlySet<string> = new Set(COMMON);

export type PasswordProblem = "TOO_SHORT" | "TOO_COMMON" | "TOO_LONG";

export function passwordProblem(password: string, context: { email?: string; username?: string } = {}): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "TOO_SHORT";
  if (password.length > 128) return "TOO_LONG";
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "TOO_COMMON";
  if (/^(.)\1+$/.test(password)) return "TOO_COMMON"; // aaaaaaaa
  const local = context.email?.split("@")[0]?.toLowerCase();
  if ((local && local.length >= 4 && lower === local) || lower === context.username?.toLowerCase()) {
    return "TOO_COMMON";
  }
  return null;
}

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  TOO_SHORT: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  TOO_LONG: "That password is too long (128 characters at most).",
  TOO_COMMON: "That password is too easy to guess. Choose a less common one.",
};
