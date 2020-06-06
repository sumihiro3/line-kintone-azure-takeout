FROM gitpod/workspace-full

# USER root
USER gitpod
# Setup Heroku CLI
# RUN curl https://cli-assets.heroku.com/install.sh | sudo sh
RUN wget -qO- https://cli-assets.heroku.com/install-ubuntu.sh | sh
