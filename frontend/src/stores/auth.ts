import { Writable, writable } from 'svelte/store';

export const userStore: Writable<User> = writable({
    username: '',
    password: '',
    privateKey: null,
    isAuth: false,
});
