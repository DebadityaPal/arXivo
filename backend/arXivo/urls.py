from django.urls import path
from arXivo.views import LoginView

urlpatterns = [
    path('login/', LoginView.as_view(), name="login"),
]