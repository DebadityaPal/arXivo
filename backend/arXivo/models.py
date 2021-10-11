from django.contrib.auth.models import AbstractUser
from django.db import models


class ArXivoUser(AbstractUser):
    isVerified = models.BooleanField("Verified User", default=False)
    email = models.EmailField("Email Address", blank=False, null=False, unique=True)

    def __str__(self):
        return self.username
