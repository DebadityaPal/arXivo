from arXivo.models import ArXivoUser
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.validators import UniqueValidator


class ArXivoUserSerializer(serializers.Serializer):
    email = serializers.EmailField(
        required=True, validators=[UniqueValidator(queryset=ArXivoUser.objects.all())]
    )
    public_key = serializers.CharField(required=True)
    username = serializers.CharField(required=True)
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
    password2 = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = ArXivoUser
        fields = (
            "username",
            "password",
            "password2",
            "email",
            "public_key",
        )

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError(
                {"password": "Password fields didn't match."}
            )
        return attrs

    def create(self, validated_data):
        user = ArXivoUser.objects.create(
            username=validated_data["username"],
            email=validated_data["email"],
            public_key=validated_data["public_key"],
        )

        user.set_password(validated_data["password"])
        user.save()
        return user
