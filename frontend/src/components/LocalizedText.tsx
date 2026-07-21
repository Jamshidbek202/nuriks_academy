import React, { forwardRef } from 'react';
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  TextInputProps,
  TextProps,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useLanguage } from '../contexts/LanguageContext';

function localizeChildren(children: React.ReactNode, t: (source: string) => string): React.ReactNode {
  return React.Children.map(children, (child) => (
    typeof child === 'string' ? t(child) : child
  ));
}

export const Text = forwardRef<React.ElementRef<typeof NativeText>, TextProps>(
  ({ children, accessibilityLabel, ...props }, ref) => {
    const { t } = useLanguage();
    return (
      <NativeText
        ref={ref}
        accessibilityLabel={accessibilityLabel ? t(accessibilityLabel) : accessibilityLabel}
        {...props}
      >
        {localizeChildren(children, t)}
      </NativeText>
    );
  },
);
Text.displayName = 'LocalizedText';

export const TextInput = forwardRef<React.ElementRef<typeof NativeTextInput>, TextInputProps>(
  ({ placeholder, accessibilityLabel, ...props }, ref) => {
    const { t } = useLanguage();
    return (
      <NativeTextInput
        ref={ref}
        placeholder={placeholder ? t(placeholder) : placeholder}
        accessibilityLabel={accessibilityLabel ? t(accessibilityLabel) : accessibilityLabel}
        {...props}
      />
    );
  },
);
TextInput.displayName = 'LocalizedTextInput';

type PickerItemProps = React.ComponentProps<typeof Picker.Item>;

export function LocalizedPickerItem({ label, ...props }: PickerItemProps) {
  const { t } = useLanguage();
  return (
    <Picker.Item
      label={typeof label === 'string' ? t(label) : ''}
      {...props}
    />
  );
}
