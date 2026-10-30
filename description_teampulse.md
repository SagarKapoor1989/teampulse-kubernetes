# TeamPulse Software Description

I made a task-management app called TeamPulse. It lets users make tasks give them to someone add a description and put them into one of three categories: To do, In progress or Done. People can change the status of a task, tasks and see live numbers like the total tasks, active tasks, completed tasks and how much is done overall.

The app is used through a web browser. The. Feel talks to the back-end through REST APIs. Task details are kept in a Redis database. It has permanent storage so the data is still there when the database container or Kubernetes pod restarts.

TeamPulse has three parts:

- The Web part shows the user interface. Is the main way people get in.
- The Task part gives the REST API for making seeing, changing and removing tasks.
- The Insights part uses the Task parts REST API. Figures out the task numbers.

The app can work on a computer, with Docker Compose. Can also be put on Kubernetes. In Kubernetes each part runs in its Deployment and can be made bigger or smaller on its own. Redis is a database part and uses a PersistentVolumeClaim for long-term storage.

TeamPulse is an app because the main goal of the project is to show how microservices work together how to build REST APIs how to use containers, how to put things on Kubernetes, how to make things bigger how to keep data safe and how to do basic security.
