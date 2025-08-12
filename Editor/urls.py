from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('join/', views.join_pdfs_view, name='join_pdf'),
    path('split/', views.split_pdf, name='split_pdf'),
    path('compres/', views.compress_pdf_view, name='compress_pdf'),
    path('rotar/', views.rotate_pdf, name='rotate_pdf'),
    path('desbloquear/', views.unlock_pdf_view, name='unlock_pdf'),
    path('check-pdf-status/', views.check_pdf_status, name='check_pdf_status'),
    path('imagen/', views.convert_images_to_pdf_view, name='convert_image_to_pdf'),
]