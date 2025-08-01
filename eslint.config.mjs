import { baseConfig, combine, typescriptConfig } from '@flexbe/eslint-config';

export default combine(
    baseConfig(),
    typescriptConfig({
        tsconfigPath: './tsconfig.json',
    })
);
