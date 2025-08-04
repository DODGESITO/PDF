from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('join/', views.join_pdfs_view, name='join_pdf'),
    path('split/', views.split_pdf, name='split_pdf'),
    path('compres/', views.compress_pdf_view, name='compress_pdf'),
    path('rotar/', views.rotate_pdf, name='rotate_pdf'),
]