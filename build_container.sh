VERSION=$(cat VERSION | perl -pe 's/^((\d+\.)*)(\d+)(.*)$/$1.($3+1).$4/e' | tee VERSION)
docker build -t jdallen/mqtttplinkbridge:$VERSION -t jdallen/mqtttplinkbridge:latest .
