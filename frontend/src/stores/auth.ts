import { Writable, writable } from 'svelte/store';
import type { User } from '../global';

export const userStore: Writable<User> = writable({
    username: '',
    password: '',
    privateKey: null,
    isAuth: false,
});
