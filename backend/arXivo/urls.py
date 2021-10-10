from arXivo.views import LoginView, RefreshView, TestView
from django.urls import path

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("test/", TestView.as_view(), name="test"),
]
