import Swal from 'sweetalert2';

export const fireError = async (err: string) =>
await Swal.fire({
    title: 'Error!',
    text: err,
    icon: 'error',
    confirmButtonText: 'Ok',
});

