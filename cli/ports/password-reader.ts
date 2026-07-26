export interface PasswordReader {
  readNewPassword(): Promise<string>
}
