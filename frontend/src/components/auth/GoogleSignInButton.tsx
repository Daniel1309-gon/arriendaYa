import { GoogleLogin } from "@react-oauth/google";

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
  onError?: () => void;
  disabled?: boolean;
}

export function GoogleSignInButton({
  onCredential,
  onError,
  disabled = false,
}: GoogleSignInButtonProps) {
  return (
    <div
      className={`w-full flex justify-center ${disabled ? "pointer-events-none opacity-50" : ""}`}
      aria-busy={disabled}
    >
      <GoogleLogin
        onSuccess={(res) => {
          if (res.credential) onCredential(res.credential);
          else onError?.();
        }}
        onError={() => onError?.()}
        useOneTap={false}
        theme="outline"
        size="large"
        shape="rectangular"
        text="continue_with"
        width="320"
      />
    </div>
  );
}
