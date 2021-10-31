from arXivo.models import ArXivoUser
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin


class ArXivoUserAdmin(UserAdmin):
    model = ArXivoUser
    list_display = ["email", "username", "public_key"]


admin.site.register(ArXivoUser)
