# syntax=docker/dockerfile:1
FROM fedora:44 AS builder

ARG NEXTCLOUD_VERSION
RUN test -n "$NEXTCLOUD_VERSION"

RUN dnf install -y --setopt=install_weak_deps=False \
      ca-certificates cmake curl extra-cmake-modules gcc-c++ inotify-tools-devel \
      kf6-karchive-devel libp11-devel ninja-build openssl-devel openssl-devel-engine pkgconf-pkg-config \
      qt6-qt5compat-devel qt6-qtbase-devel qt6-qtbase-private-devel qt6-qtdeclarative-devel qt6-qtsvg-devel \
      qt6-qttools qt6-qttools-devel qt6-qtwebsockets-devel qtkeychain-qt6-devel \
      kdsingleapplication-qt6-devel sqlite-devel zlib-devel \
 && dnf clean all

WORKDIR /src
RUN curl -fsSL --retry 3 \
      "https://github.com/nextcloud/desktop/archive/refs/tags/v${NEXTCLOUD_VERSION}.tar.gz" \
      | tar -xz --strip-components=1

RUN cmake -S /src -B /build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/usr \
      -DCMAKE_INSTALL_LIBDIR=lib64 \
      -DBUILD_CLIENT=ON \
      -DBUILD_GUI=OFF \
      -DBUILD_SHELL_INTEGRATION=OFF \
      -DBUILD_SHELL_INTEGRATION_DOLPHIN=OFF \
      -DBUILD_SHELL_INTEGRATION_ICONS=OFF \
      -DBUILD_SHELL_INTEGRATION_NAUTILUS=OFF \
      -DBUILD_TESTING=OFF \
      -DBUILD_UPDATER=OFF \
      -DBUILD_WITH_WEBENGINE=OFF \
      -DINSTALL_SYSTEMD=OFF \
      -DNO_SHIBBOLETH=ON \
      -DWITH_PROVIDERS=OFF \
 && cmake --build /build --target nextcloudcmd --parallel "$(nproc)" \
 && mkdir -p /stage/usr/bin /stage/usr/lib64 /stage/etc/Nextcloud \
 && install -m 0755 /build/bin/nextcloudcmd /stage/usr/bin/nextcloudcmd \
 && cp -a /build/bin/libnextcloudsync.so* /build/bin/libnextcloud_csync.so* /stage/usr/lib64/ \
 && install -m 0644 /src/sync-exclude.lst /stage/etc/Nextcloud/sync-exclude.lst

FROM builder AS bundler
COPY scripts/bundle.sh /usr/local/bin/bundle-nextcloudcmd
RUN chmod +x /usr/local/bin/bundle-nextcloudcmd \
 && /usr/local/bin/bundle-nextcloudcmd /stage /src /bundle

FROM fedora:44 AS test
ARG NEXTCLOUD_VERSION
RUN dnf install -y --setopt=install_weak_deps=False zip \
 && dnf clean all
COPY --from=bundler /bundle/ /bundle/
RUN env -i HOME=/tmp PATH=/usr/bin:/bin \
      /bundle/opt/nextcloudcmd/bin/nextcloudcmd --version \
 && ! LD_LIBRARY_PATH=/bundle/opt/nextcloudcmd/lib \
      ldd /bundle/opt/nextcloudcmd/libexec/nextcloudcmd | grep -q 'not found' \
 && mkdir -p /release \
 && cd /bundle \
 && zip -9qr /release/nextcloudcmd-fedora44-x86_64.zip opt \
 && cd /release \
 && sha256sum nextcloudcmd-fedora44-x86_64.zip \
      > nextcloudcmd-fedora44-x86_64.zip.sha256 \
 && du -sh /bundle/opt/nextcloudcmd /release/nextcloudcmd-fedora44-x86_64.zip

FROM scratch AS artifact
COPY --from=test /release/ /
