/// <reference types="svelte" />

import type forge from 'node-forge';

type User = {
    username: string;
    password: string;
    privateKey: forge.pki.rsa.PrivateKey;
    isAuth: boolean;
};

type Notification = {
    filename: string;
    address: string;
    key: string;
    file_type: string;
    seen: boolean;
    sender: string;
};
