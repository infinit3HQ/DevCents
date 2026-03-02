import { createContext, useContext } from "react";

export interface EncryptionContextType {
  isEnabled: boolean;
  isUnlocked: boolean;
  encryptValue: (plaintext: string) => Promise<string>;
  decryptValue: (ciphertext: string) => Promise<string>;
  setupEncryption: () => void;
}

export const EncryptionContext = createContext<EncryptionContextType>({
  isEnabled: false,
  isUnlocked: false,
  encryptValue: async (v) => v,
  decryptValue: async (v) => v,
  setupEncryption: () => {},
});

export const useEncryption = () => useContext(EncryptionContext);
