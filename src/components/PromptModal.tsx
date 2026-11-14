import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { AppText } from '@/components/ui/AppText';
import { useSubmit } from '@/hooks/useSubmit';
import { errorMessage } from '@/lib/utils';

export function PromptModal({
  visible,
  title,
  message,
  label,
  placeholder,
  confirmLabel = 'Save',
  initialValue = '',
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  label: string;
  placeholder?: string;
  confirmLabel?: string;
  initialValue?: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const { submit, busy } = useSubmit();

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter a name to continue.');
      return;
    }
    setError(null);
    void submit(async () => {
      try {
        await onSubmit(trimmed);
        setValue('');
        onClose();
      } catch (cause) {
        setError(errorMessage(cause));
      }
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={message}>
      <TextField
        label={label}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          if (error) setError(null);
        }}
        placeholder={placeholder}
        error={error}
        autoFocus
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
      />
      <Button label={confirmLabel} onPress={handleSubmit} loading={busy} fullWidth />
      <AppText variant="small" color="muted" align="center">
        Saved meals appear in your diary and can be logged in one tap.
      </AppText>
    </Sheet>
  );
}
