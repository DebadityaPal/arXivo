import json

from arXivo.models import ArXivoUser
from arXivo.serializers import ArXivoUserSerializer, SearchSerializer
from arXivo.utils import get_tokens_for_user
from django.conf import settings
from django.contrib.auth import authenticate
from django.http.response import JsonResponse
from django.middleware import csrf
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken


class RegisterView(APIView):
    serializer_class = ArXivoUserSerializer

    def post(self, request, format=None):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            csrf.get_token(request)
            return JsonResponse(
                {"message": "User Created Successfully"}, status=status.HTTP_200_OK
            )
        else:
            return JsonResponse(
                {"message": "There was an error!", "error": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )


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
                response.set_cookie(
                    key="refresh_token",
                    value=data["refresh"],
                    expires=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"],
                    secure=settings.SIMPLE_JWT["AUTH_COOKIE_SECURE"],
                    httponly=settings.SIMPLE_JWT["AUTH_COOKIE_HTTP_ONLY"],
                    samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
                )
                csrf.get_token(request)
                response.data = {"message": "Login successfully", "data": data}
                return response
            else:
                return Response(
                    {"error": "This account is not active!!"},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            return Response(
                {"error": "Invalid username or password!!"},
                status=status.HTTP_404_NOT_FOUND,
            )


class RefreshView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, format=None):
        refresh = RefreshToken(request.COOKIES.get("refresh_token"))
        response = Response(status=status.HTTP_200_OK)
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE"],
            value=refresh.access_token,
            expires=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"],
            secure=settings.SIMPLE_JWT["AUTH_COOKIE_SECURE"],
            httponly=settings.SIMPLE_JWT["AUTH_COOKIE_HTTP_ONLY"],
            samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
        )
        response.set_cookie(
            key="refresh_token",
            value=str(refresh),
            expires=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"],
            secure=settings.SIMPLE_JWT["AUTH_COOKIE_SECURE"],
            httponly=settings.SIMPLE_JWT["AUTH_COOKIE_HTTP_ONLY"],
            samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
        )
        response.data = {"message": "Tokens Refreshed Successfully"}
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, format=None):
        response = Response(status=status.HTTP_200_OK)
        response.delete_cookie(settings.SIMPLE_JWT["AUTH_COOKIE"])
        response.delete_cookie("refresh_token")
        response.data = {"message": "Logged Out Successfully"}
        return response


class SearchView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SearchSerializer

    def post(self, request, format=None):
        users = ArXivoUser.objects.filter(
            username__icontains=request.data["search_term"]
        )
        serializer = self.serializer_class(users, many=True)
        return JsonResponse({"data": serializer.data}, status=status.HTTP_200_OK)


class GetNotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        notif_data = request.user.notification_array
        notif_pyobj = json.loads(notif_data)["data"]

        for _notif in notif_pyobj:
            _notif["seen"] = True

        request.user.notification_array = json.dumps({"data": notif_pyobj})
        request.user.save()

        return JsonResponse(notif_data, status=status.HTTP_200_OK, safe=False)


class SendNotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, format=None):
        other_user = ArXivoUser.objects.get(username=request.data["send_to"])
        notif_data = {
            "filename": request.data["filename"],
            "address": request.data["address"],
            "key": request.data["key"],
            "file_type": request.data["file_type"],
            "seen": False,
            "sender": request.user.username,
        }
        prev_data = json.loads(other_user.notification_array)
        prev_data["data"].append(notif_data)
        other_user.notification_array = json.dumps(prev_data)
        other_user.save()
        data = {"reponse": "good_response"}
        return JsonResponse(data, status=status.HTTP_200_OK)
