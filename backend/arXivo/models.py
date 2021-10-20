from django.contrib.auth.models import AbstractUser
from django.db import models


class ArXivoUser(AbstractUser):
    public_key = models.TextField("Public Key", blank=False, null=False)
    email = models.EmailField("Email Address", blank=False, null=False, unique=True)
    notification_array = models.JSONField("Notification Array", blank=True, null=True)

    def __str__(self):
        return self.username
