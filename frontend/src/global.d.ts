/// <reference types="svelte" />

type User = {
    username: string;
    password: string;
    privateKey: CryptoKey;
    isAuth: boolean;
};
