from arXivo.utils import get_tokens_for_user
from django.conf import settings
from django.contrib.auth import authenticate
from django.middleware import csrf
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView


class LoginView(APIView):
    def post(self, request, format=None):
        data = request.data
        response = Response()
        username = data.get("username", None)
        password = data.get("password", None)
        user = authenticate(username=username, password=password)
        if user is not None:
            if user.is_active:
                data = get_tokens_for_user(user)
                response.set_cookie(
                    key=settings.SIMPLE_JWT["AUTH_COOKIE"],
                    value=data["access"],
                    expires=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"],
                    secure=settings.SIMPLE_JWT["AUTH_COOKIE_SECURE"],
                    httponly=settings.SIMPLE_JWT["AUTH_COOKIE_HTTP_ONLY"],
                    samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
                )

                csrf.get_token(request)
                response.data = {"Success": "Login successfully", "data": data}
                return response
            else:
                return Response(
                    {"No active": "This account is not active!!"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            return Response(
                {"Invalid": "Invalid username or password!!"},
                status=status.HTTP_404_NOT_FOUND,
            )
