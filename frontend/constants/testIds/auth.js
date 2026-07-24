// Test IDs for the auth feature (login, register, logout) — consumed via
// React Native's `testID` prop on TouchableOpacity / Pressable / TextInput /
// Button / Switch and friends. Add new keys here as you wire up additional
// auth UI; see ./index.js for the recipe to add a new feature file.
//
// React Native uses `testID` (camelCase, no dash), not `data-testid`:
//   import { LOGIN } from '../constants/testIds';
//   <TouchableOpacity testID={LOGIN.submitButton} onPress={...} />
//   <TextInput testID={LOGIN.emailInput} ... />
//
// Directive:
//   - Keys are camelCase, values are kebab-case shaped as `<feature>-<element>`
//     (or `<feature>-<element>-<qualifier>` when an element repeats). Examples:
//     'login-submit-button', 'cart-quantity-input', 'product-card-image'.
//
// Why kebab-case values: required by qabot's CSS-attribute-style selector
// matcher and the lint rule `emergent(kebab-case-testid-prop)`.

export const LOGIN = {
	phoneInput: 'login-email-input',
	// Legacy alias retained for the existing release test selector.
	emailInput: 'login-email-input',
	passwordInput: 'login-password-input',
	submitButton: 'login-submit-button',
	forgotPasswordLink: 'login-forgot-password-link',
	registerLink: 'login-register-link',
	activateLink: 'login-activate-link',
};

export const ACTIVATE = {
	phoneInput: 'activate-phone-input',
	codeInput: 'activate-code-input',
	passwordInput: 'activate-password-input',
	passwordConfirmInput: 'activate-password-confirm-input',
	submitButton: 'activate-submit-button',
	resendButton: 'activate-resend-button',
	loginLink: 'activate-login-link',
};

export const PASSWORD_RESET = {
	phoneInput: 'password-reset-phone-input',
	codeInput: 'password-reset-code-input',
	passwordInput: 'password-reset-password-input',
	passwordConfirmInput: 'password-reset-password-confirm-input',
	requestButton: 'password-reset-request-button',
	confirmButton: 'password-reset-confirm-button',
	loginLink: 'password-reset-login-link',
};

export const REGISTER = {
	nameInput: 'register-name-input',
	emailInput: 'register-email-input',
	passwordInput: 'register-password-input',
	passwordConfirmInput: 'register-password-confirm-input',
	submitButton: 'register-submit-button',
	loginLink: 'register-login-link',
};

export const LOGOUT = {
	button: 'logout-button',
};
