

### Enson olarak sunu yaptik

2 step form ile Cloudflare R2'ya dosya yukleme: '/upload'.
Express ile R2'dan stream.

Soyle bir bug vardi, simdilik yapilan cozum ise yariyor gibi ama uzun parcalarda yine orataya cikabilir.
```
there is a issue probably related to Cloudflare R2, if chunk size is set to (10 ** 6 / 10) or 100kb,
exactly in two minutes mark, requested chunk on the client stuck in pending status.
because of that adjust the chunk size to 500kb or 1mb to delay the track being paused.
```

### Yapilacaklar
- WaveformData olsuturmak: 
        - bunun icin dev sirasinda executables klasorundeki audiowaveform.exe ullanilacak.
        - bir sekilde r2 ya upload edilen dosya alinip wave data olsuturulacak

- playlist olusturma yada album olarak yuklenen parcalari sirali olarak surekli playback.