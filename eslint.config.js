import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
		ignores: ['.next', 'src/generated']
	},
  ...nextVitals,
  {
    files: ['**/*.ts', '**/*.tsx'],
		extends: [
			...tseslint.configs.recommended,
			...tseslint.configs.recommendedTypeChecked,
			...tseslint.configs.stylisticTypeChecked
		],
      rules: {
    "@typescript-eslint/array-type": "off",
    "@typescript-eslint/consistent-type-definitions": "off",
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/require-await": "off",
    // `||` is intentional for empty-string fallbacks; `??` would change behavior.
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    "@typescript-eslint/no-misused-promises": [
      "error",
      { checksVoidReturn: { attributes: false } },
    ],
  },
  },
  {
    // Vendored shadcn/ui components use namespace imports that are only used as types.
    files: ['src/components/ui/**'],
    rules: { "@typescript-eslint/consistent-type-imports": "off" },
  },
  {
    // Artwork lives behind R2 URLs (often presigned, so the URL changes). next/image
    // would proxy and cache each variant and burn the image-optimization quota for no gain.
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // node:test returns promises from top-level test()/describe() calls.
    files: ['**/*.test.ts'],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
  {
		linterOptions: {
			reportUnusedDisableDirectives: true
		},
		languageOptions: {
			parserOptions: {
				projectService: true
			}
		}
	}
)
